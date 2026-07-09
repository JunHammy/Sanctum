export interface Env {
  GOOGLE_CLIENT_SECRET: string
}

// Origins allowed to call this proxy — the deployed GitHub Pages site, plus
// any localhost port for local dev/testing. Any *localhost* port (not just
// 5173) is allowed rather than one hardcoded value: `vite preview` (used to
// exercise the production build + service worker locally, since the dev
// server never registers one) picks whatever port is free, which isn't
// always 5173 — confirmed as a real blocker during offline-mode testing,
// where the token exchange silently failed as a plain "Failed to fetch"
// (a CORS rejection gives no other detail) against a preview server running
// on a different port. No client_secret exposure risk either way — that
// stays server-side in this Worker's own env regardless of which origin is
// allowed to call it.
const ALLOWED_ORIGINS = new Set(['https://junhammy.github.io'])
const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || LOCALHOST_ORIGIN.test(origin)
}

// The only two grant types Sanctum's auth flow ever legitimately sends —
// this proxy isn't a general-purpose Google token endpoint passthrough.
const ALLOWED_GRANT_TYPES = new Set(['authorization_code', 'refresh_token'])

function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

async function handleToken(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
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
}

const MAX_FETCH_BYTES = 5 * 1024 * 1024 // 5MB — plenty for HTML, caps abuse as a large-file relay
const FETCH_TIMEOUT_MS = 10_000

// Blocks the obvious loopback/private-network literals a URL could name
// directly. Not exhaustive (doesn't chase DNS rebinding, IPv6 edge cases,
// etc.) — Cloudflare Workers run on Cloudflare's own edge network, not
// inside any private network of ours, so this is defense-in-depth against
// a lazy attempt to use the endpoint as an internal-network probe, not a
// hardened SSRF barrier for a high-value target.
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
]

function isBlockedHostname(hostname: string): boolean {
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))
}

// Fetches an arbitrary public URL server-side and returns its raw HTML —
// the whole reason this route exists at all is that a browser blocks
// cross-origin fetch() via CORS, so the client-side web clipper has no way
// to download another site's HTML directly. Content EXTRACTION (finding
// the actual article inside that HTML) happens back on the client via
// @mozilla/readability, not here — this route's only job is getting past
// CORS, nothing more.
async function handleFetchUrl(request: Request, headers: HeadersInit): Promise<Response> {
  let target: URL
  try {
    const { url } = (await request.json()) as { url?: string }
    if (typeof url !== 'string') throw new Error('missing url')
    target = new URL(url)
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_url' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'unsupported_protocol' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
  if (isBlockedHostname(target.hostname)) {
    return new Response(JSON.stringify({ error: 'blocked_host' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const targetRes = await fetch(target.toString(), {
      signal: controller.signal,
      // A real browser UA — a good number of sites block requests carrying
      // an obvious bot/empty user-agent outright, independent of any
      // actual bot-detection challenge.
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })

    if (!targetRes.ok) {
      return new Response(JSON.stringify({ error: 'fetch_failed', status: targetRes.status }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const contentLength = targetRes.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_FETCH_BYTES) {
      return new Response(JSON.stringify({ error: 'response_too_large' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const body = await targetRes.arrayBuffer()
    if (body.byteLength > MAX_FETCH_BYTES) {
      return new Response(JSON.stringify({ error: 'response_too_large' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    return new Response(body, {
      status: 200,
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return new Response(JSON.stringify({ error: timedOut ? 'timeout' : 'fetch_error' }), {
      status: 502,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  } finally {
    clearTimeout(timeout)
  }
}

// Stateless — no database, nothing persisted between requests. Two jobs:
// (1) /token — add the client_secret to an OAuth exchange, the original
// reason this Worker exists; (2) /fetch-url — fetch an arbitrary public URL
// server-side so the client-side web clipper can get past the browser's
// CORS restriction on cross-origin fetch().
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const headers = corsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname === '/token') {
      return handleToken(request, env, headers)
    }
    if (request.method === 'POST' && url.pathname === '/fetch-url') {
      return handleFetchUrl(request, headers)
    }

    return new Response('Not found', { status: 404, headers })
  },
}
