export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

// A small stateless Cloudflare Worker (see worker/) with two jobs: (1) the
// OAuth client_secret proxy this was originally built for — Google's token
// endpoint requires the secret for the authorization-code/refresh-token
// exchange even with PKCE, and a secret can't live in a public frontend
// bundle; (2) a /fetch-url route the web clipper uses to get past the
// browser's CORS restriction on fetching another site's HTML directly.
export const AUTH_PROXY_URL = import.meta.env.VITE_AUTH_PROXY_URL

// Full Drive access, not the narrower drive.file: the app needs to see
// files added to the vault folder from outside itself (Drive web UI, phone,
// desktop sync), which drive.file's per-file-grant model can't support.
export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

export const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
