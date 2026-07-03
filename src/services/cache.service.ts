import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'sanctum-cache'
const DB_VERSION = 1
const CONTENT_STORE = 'content'
const META_STORE = 'meta'

export interface CachedNoteContent {
  raw: string
  modifiedTime: string
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(CONTENT_STORE)
        db.createObjectStore(META_STORE)
      },
    })
  }
  return dbPromise
}

// Scoped to exactly what search needs — the master plan's broader
// offline-caching vision (file tree cache, image blob cache) is a separate,
// bigger feature not built yet. Two stores: raw note content (keyed by
// fileId, tagged with the Drive modifiedTime it was fetched at, so a
// future read can tell whether it's stale) and small serialized blobs like
// the MiniSearch index itself.
export async function getCachedContent(fileId: string): Promise<CachedNoteContent | undefined> {
  return (await getDb()).get(CONTENT_STORE, fileId)
}

export async function setCachedContent(fileId: string, value: CachedNoteContent): Promise<void> {
  await (await getDb()).put(CONTENT_STORE, value, fileId)
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await getDb()).get(META_STORE, key)
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await (await getDb()).put(META_STORE, value, key)
}
