import { GOOGLE_CLIENT_ID, GOOGLE_REVOKE_ENDPOINT, GOOGLE_USERINFO_ENDPOINT, OAUTH_SCOPES } from '../config/constants'

export interface AuthUser {
  name: string
  email: string
  avatar: string
}

interface TokenResponse {
  access_token: string
  expires_in?: number
  error?: string
}

export interface AccessTokenResult {
  accessToken: string
  expiresIn: number
}

interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: { type: string }) => void
          }) => TokenClient
          revoke: (token: string, callback?: () => void) => void
        }
      }
    }
  }
}

let gisScriptPromise: Promise<void> | null = null

// Loaded lazily so sign-in stays cheap until the user actually clicks it.
function loadGisScript(): Promise<void> {
  if (gisScriptPromise) return gisScriptPromise

  gisScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'))
    document.head.appendChild(script)
  })

  return gisScriptPromise
}

// `silent: true` requests renewal with `prompt: ''` — GIS's documented
// silent-refresh mode, using a hidden iframe against the still-active
// Google session instead of a visible account picker. Used to renew the
// access token in the background before it expires, so a long-running
// session doesn't get force-signed-out mid-edit the moment the token lapses.
export async function requestAccessToken(options?: { silent?: boolean }): Promise<AccessTokenResult> {
  await loadGisScript()

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: OAUTH_SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? 'Sign-in failed'))
          return
        }
        resolve({ accessToken: response.access_token, expiresIn: response.expires_in ?? 3600 })
      },
      error_callback: (error) => {
        reject(new Error(error.type === 'popup_closed' ? 'Sign-in cancelled' : `Sign-in failed: ${error.type}`))
      },
    })
    client.requestAccessToken({ prompt: options?.silent ? '' : 'select_account' })
  })
}

export async function fetchUserInfo(accessToken: string): Promise<AuthUser> {
  const res = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch user info')

  const data = await res.json()
  return { name: data.name, email: data.email, avatar: data.picture }
}

// Silent renewal (`prompt: ''`) can report success while quietly returning
// a token scoped down from what was requested — Google doesn't reliably
// re-grant a sensitive scope like full Drive access without an interactive
// consent screen. Checking the actual granted scope before trusting a
// silently-renewed token is the only way to catch that; assuming success
// meant it once already corrupted a working session with a token that
// looked fine but 403'd on every Drive call.
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

export function revokeToken(accessToken: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken, () => resolve())
    } else {
      fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${accessToken}`, { method: 'POST' }).finally(() => resolve())
    }
  })
}
