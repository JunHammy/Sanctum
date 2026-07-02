import { GOOGLE_CLIENT_ID, GOOGLE_REVOKE_ENDPOINT, GOOGLE_USERINFO_ENDPOINT, OAUTH_SCOPES } from '../config/constants'

export interface AuthUser {
  name: string
  email: string
  avatar: string
}

interface TokenResponse {
  access_token: string
  error?: string
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

export async function requestAccessToken(): Promise<string> {
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
        resolve(response.access_token)
      },
      error_callback: (error) => {
        reject(new Error(error.type === 'popup_closed' ? 'Sign-in cancelled' : `Sign-in failed: ${error.type}`))
      },
    })
    client.requestAccessToken({ prompt: 'select_account' })
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

export function revokeToken(accessToken: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken, () => resolve())
    } else {
      fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${accessToken}`, { method: 'POST' }).finally(() => resolve())
    }
  })
}
