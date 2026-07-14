import { readFileBlob } from '../services/drive.service'

// Module-level, not per-component-instance: switching away from a PDF tab
// and back (or toggling other tabs in between) shouldn't re-fetch and
// re-object-URL the same file from scratch. Deliberately never revoked —
// the browser reclaims it on navigation/tab close, fine at personal-vault
// scale — same reasoning useImageResolution.ts's own cache documents. Kept
// as its own small standalone cache rather than sharing that one, since
// this is a different consumer (a handful of PDF tabs, not many inline
// images) and reusing it isn't worth touching that working code for.
const resolvedUrlCache = new Map<string, string>()
const inFlightFetches = new Map<string, Promise<string>>()

export function resolvePdfBlobUrl(fileId: string): Promise<string> {
  const cached = resolvedUrlCache.get(fileId)
  if (cached) return Promise.resolve(cached)

  let promise = inFlightFetches.get(fileId)
  if (!promise) {
    promise = readFileBlob(fileId).then((blob) => {
      const url = URL.createObjectURL(blob)
      resolvedUrlCache.set(fileId, url)
      return url
    })
    inFlightFetches.set(fileId, promise)
    promise.catch(() => inFlightFetches.delete(fileId)) // allow retrying a genuine failure later
  }
  return promise
}
