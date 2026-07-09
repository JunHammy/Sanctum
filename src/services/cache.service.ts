import { openDB, type IDBPDatabase } from 'idb'
import type { FileTreeNode } from '../types/vault.types'
import type { VaultMeta } from './drive.service'

const DB_NAME = 'sanctum-cache'
const DB_VERSION = 1
const CONTENT_STORE = 'content'
const META_STORE = 'meta'

export interface CachedNoteContent {
  raw: string
  modifiedTime: string
}

interface CachedVaults {
  containerFolderId: string
  vaults: VaultMeta[]
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

export async function deleteMeta(key: string): Promise<void> {
  await (await getDb()).delete(META_STORE, key)
}

// Offline read-path support: the file tree and vaults list themselves were
// never cached before (only note content and the search/tag/backlink
// indices were) — without these, there was no way to even render the
// sidebar offline, let alone open a note. Reuses the existing meta store
// rather than adding a new one (same convention as the search/tag/backlink
// index keys below).
function fileTreeKey(vaultId: string): string {
  return `file-tree:${vaultId}`
}

export async function getCachedFileTree(vaultId: string): Promise<FileTreeNode[] | undefined> {
  return getMeta<FileTreeNode[]>(fileTreeKey(vaultId))
}

export async function setCachedFileTree(vaultId: string, tree: FileTreeNode[]): Promise<void> {
  await setMeta(fileTreeKey(vaultId), tree)
}

export async function clearCachedFileTree(vaultId: string): Promise<void> {
  await deleteMeta(fileTreeKey(vaultId))
}

// Global, not vault-scoped — this key holds the vaults list itself, not
// anything belonging to a single vault.
const VAULTS_LIST_KEY = 'vaults-list'

export async function getCachedVaults(): Promise<CachedVaults | undefined> {
  return getMeta<CachedVaults>(VAULTS_LIST_KEY)
}

export async function setCachedVaults(containerFolderId: string, vaults: VaultMeta[]): Promise<void> {
  await setMeta<CachedVaults>(VAULTS_LIST_KEY, { containerFolderId, vaults })
}
