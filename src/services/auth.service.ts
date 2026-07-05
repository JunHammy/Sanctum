import { AUTH_PROXY_URL, GOOGLE_CLIENT_ID, GOOGLE_REVOKE_ENDPOINT, GOOGLE_USERINFO_ENDPOINT, OAUTH_SCOPES } from '../config/constants'

export interface AuthUser {
  name: string
  email: string
  avatar: string
}

export interface SignInResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const PROXY_TOKEN_ENDPOINT = `${AUTH_PROXY_URL}/token`

// import.meta.env.BASE_URL mirrors vite.config.ts's `base` ('/Sanctum/'),
// so this resolves correctly in both dev (localhost) and prod (GitHub
// Pages) without hardcoding either origin. Must be registered as an
// Authorized redirect URI in Google Cloud Console for each environment.
const REDIRECT_URI = `${window.location.origin}${import.meta.env.BASE_URL}oauth-callback.html`

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}

interface OAuthCallbackMessage {
  type: 'sanctum-oauth-callback'
  code: string | null
  state: string | null
  error: string | null
}

function isOAuthCallbackMessage(data: unknown): data is OAuthCallbackMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'sanctum-oauth-callback'
}

// Opens Google's consent screen in a popup (a real click triggers this —
// signIn() is only ever called from a button handler — so popup-blocking
// doesn't apply the way it did for the old background silent-refresh
// attempt) and waits for oauth-callback.html to relay back the resulting
// code via postMessage.
function waitForAuthCode(authUrl: string, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, 'sanctum-oauth', 'width=500,height=650')
    if (!popup) {
      reject(new Error('Popup blocked — please allow popups for this site and try again.'))
      return
    }

    const TIMEOUT_MS = 2 * 60 * 1000
    const timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error('Sign-in timed out'))
    }, TIMEOUT_MS)

    // Detects the user closing the popup manually without completing
    // consent. Wrapped in try/catch: Cross-Origin-Opener-Policy can block
    // reading `.closed` while the popup is on Google's cross-origin consent
    // page — this poll just skips those ticks rather than throwing.
    const closeCheckId = setInterval(() => {
      try {
        if (popup.closed) {
          cleanup()
          reject(new Error('Sign-in cancelled'))
        }
      } catch {
        // COOP blocked the read this tick — try again next tick.
      }
    }, 500)

    function cleanup() {
      clearTimeout(timeoutId)
      clearInterval(closeCheckId)
      window.removeEventListener('message', handleMessage)
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (!isOAuthCallbackMessage(event.data)) return
      cleanup()
      const { code, state, error } = event.data
      if (error) {
        reject(new Error(`Sign-in failed: ${error}`))
      } else if (state !== expectedState) {
        reject(new Error('Sign-in failed: state mismatch'))
      } else if (!code) {
        reject(new Error('Sign-in failed: no authorization code returned'))
      } else {
        resolve(code)
      }
    }
    window.addEventListener('message', handleMessage)
  })
}

// Interactive sign-in: PKCE authorization-code flow. The code exchange
// goes through our own Cloudflare Worker proxy (worker/), not directly to
// Google — Google's token endpoint requires a client_secret even with
// PKCE, and a secret can't live in this public frontend bundle. The
// Worker's only job is adding that secret server-side and forwarding the
// request; everything else here (PKCE generation, the popup, state
// verification) runs the same as it would for a pure client-side flow.
export async function signIn(): Promise<SignInResult> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateCodeVerifier()

  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT)
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', OAUTH_SCOPES)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  // access_type=offline + prompt=consent is what makes Google actually
  // issue a refresh_token — without prompt=consent, a returning user who
  // already granted access once won't get a fresh one.
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  const code = await waitForAuthCode(authUrl.toString(), state)

  const res = await fetch(PROXY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? 'Sign-in failed')
  if (!data.refresh_token) throw new Error('Sign-in did not return a refresh token — please try again')

  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in ?? 3600 }
}

export interface RefreshResult {
  accessToken: string
  expiresIn: number
}

// Background renewal — a plain POST through the same Worker proxy, no
// popup, no iframe, nothing for a browser popup-blocker to catch. This is
// what makes background renewal actually reliable, unlike the old GIS
// silent-refresh-via-popup attempt it replaces.
export async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
  const res = await fetch(PROXY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? 'Refresh failed')
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 }
}

export async function fetchUserInfo(accessToken: string): Promise<AuthUser> {
  const res = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch user info')

  const data = await res.json()
  return { name: data.name, email: data.email, avatar: data.picture }
}

export async function tokenHasScope(accessToken: string, requiredScope: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`)
    if (!res.ok) return false
    const data = await res.json()
    return typeof data.scope === 'string' && data.scope.split(' ').includes(requiredScope)
  } catch {
    return false
  }
}

// Revoking either the access or refresh token invalidates the whole pair
// on Google's side, so revoking the refresh token (the longer-lived of
// the two) on sign-out is enough. Sign-out proceeds locally regardless of
// whether this network call actually succeeds (offline, already revoked,
// etc.) — swallow failures rather than reject, since callers don't await
// this to decide whether sign-out itself worked.
export function revokeToken(token: string): Promise<void> {
  return fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${token}`, { method: 'POST' })
    .then(() => undefined)
    .catch(() => undefined)
}
