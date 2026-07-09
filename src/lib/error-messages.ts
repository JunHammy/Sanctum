import { DriveApiError } from './drive-api'

// Google's error bodies are raw JSON (`DriveApiError.message` is the literal
// response text) — never something safe to show a user directly. This is the
// one place that turns a caught error into a short, non-technical message.
const SCOPE_REASONS = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'])

function parseGoogleReason(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw)
    return parsed?.error?.errors?.[0]?.reason ?? parsed?.error?.details?.[0]?.reason ?? null
  } catch {
    return null
  }
}

export function toUserMessage(err: unknown, fallback: string): string {
  if (err instanceof DriveApiError) {
    if (err.status === 403 && SCOPE_REASONS.has(parseGoogleReason(err.message) ?? '')) {
      return 'Google Drive access was not fully granted. Sign out, sign in again, and check the box granting Drive access on the Google screen.'
    }
    if (err.status === 401) return 'Your Google session expired. Please sign in again.'
    return fallback
  }
  // A plain Error whose message is itself a raw JSON blob (e.g. re-thrown
  // from somewhere that didn't go through DriveApiError) isn't safe either.
  if (err instanceof Error && !err.message.trim().startsWith('{')) return err.message
  return fallback
}

// No paid logging service (zero-cost constraint) — this is deliberately just
// a tagged console.error, visible via devtools in production if needed.
export function logError(context: string, err: unknown): void {
  console.error(`[Sanctum:${context}]`, err)
}

// Distinguishes "the network is genuinely unreachable" from a real Drive
// error (a response was received and something about the request was
// rejected). A `fetch()` that never got a response rejects with a plain
// TypeError — that's the browser's own signal for connectivity failure, as
// opposed to a DriveApiError/other Error, which means the server actually
// responded. Checked first via navigator.onLine since that's a faster,
// synchronous read of the same fact when it's available. Used by
// vault.store.ts, note.store.ts, and auth.store.ts to decide whether to fall
// back to a cached read (offline) or surface the error as-is (a real
// failure) — reading navigator.onLine directly rather than importing
// network.store.ts since lib/ files in this codebase don't import stores.
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  return err instanceof TypeError
}
