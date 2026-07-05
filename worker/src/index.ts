export interface Env {
  GOOGLE_CLIENT_SECRET: string
}

// Origins allowed to call this proxy — the dev server and the deployed
// GitHub Pages site. Anything else gets no Access-Control-Allow-Origin
// header, which the browser then blocks on its own.
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'https://junhammy.github.io'])

// The only two grant types Sanctum's auth flow ever legitimately sends —
// this proxy isn't a general-purpose Google token endpoint passthrough.
const ALLOWED_GRANT_TYPES = new Set(['authorization_code', 'refresh_token'])

function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

// This Worker's entire job: take the same form body the client would have
// sent Google directly, add the client_secret (kept here as an encrypted
// Cloudflare secret, never in the frontend bundle or git), and forward it.
// Stateless — no database, nothing persisted between requests.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const headers = corsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/token') {
      return new Response('Not found', { status: 404, headers })
    }

    const incoming = await request.formData()
    const grantType = incoming.get('grant_type')
    if (typeof grantType !== 'string' || !ALLOWED_GRANT_TYPES.has(grantType)) {
      return new Response(JSON.stringify({ error: 'unsupported_grant_type' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const body = new URLSearchParams()
    for (const [key, value] of incoming.entries()) {
      if (typeof value === 'string') body.set(key, value)
    }
    body.set('client_secret', env.GOOGLE_CLIENT_SECRET)

    const googleRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = await googleRes.text()

    return new Response(data, {
      status: googleRes.status,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  },
}
