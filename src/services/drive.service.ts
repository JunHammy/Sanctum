import { useAuthStore } from '../stores/auth.store'
import { useVaultStore } from '../stores/vault.store'
import { useNoteStore } from '../stores/note.store'
import { useNetworkStore } from '../stores/network.store'
import * as driveApi from '../lib/drive-api'
import { DriveApiError, FOLDER_MIME } from '../lib/drive-api'
import type { DriveFile, DriveRevision } from '../lib/drive-api'

export type { DriveFile }

// "Sanctum" is now a *container* folder — each vault is a named subfolder
// directly under it, discovered by listing the container's children. A
// single-vault install predates this: its notes/folders sit directly inside
// "Sanctum" itself, which migrateFlatVaultIfNeeded detects and fixes once.
const CONTAINER_FOLDER_NAME = 'Sanctum'
const MIGRATION_VAULT_NAME = 'Cat Cognition Research'
const ASSETS_FOLDER_NAME = 'assets'

export interface VaultMeta {
  id: string
  name: string
}

function getToken(): string {
  const token = useAuthStore.getState().token
  if (!token) throw new Error('Not signed in')
  return token
}

// Read-only offline mode (MP §21): every mutation below calls this first, so
// an offline write fails immediately with a clean, honest message instead of
// either a raw failed-fetch TypeError or (worse) silently hanging until the
// browser's own request timeout. Reads (listAllFiles, readFile, etc.) are
// deliberately NOT guarded — they need to actually attempt the network call
// so vault.store.ts/note.store.ts's isOfflineError-based cache-fallback logic
// has a real failure to catch.
function assertOnline(): void {
  if (!useNetworkStore.getState().isOnline) throw new Error("You're offline — read-only until reconnected.")
}

async function withAuth<T>(fn: (token: string) => Promise<T>): Promise<T> {
  try {
    return await fn(getToken())
  } catch (err) {
    if (err instanceof DriveApiError && err.status === 401) {
      useAuthStore.getState().signOut()
    }
    throw err
  }
}

export function listAllFiles(): Promise<DriveFile[]> {
  return withAuth((token) => driveApi.listAllFiles(token))
}

export function readFile(fileId: string): Promise<string> {
  return withAuth((token) => driveApi.readFile(token, fileId))
}

export function readFileBlob(fileId: string): Promise<Blob> {
  return withAuth((token) => driveApi.readFileBlob(token, fileId))
}

export function updateFile(fileId: string, content: string): Promise<DriveFile> {
  assertOnline()
  return withAuth((token) => driveApi.updateFile(token, fileId, content))
}

export function findOrCreateContainerFolder(): Promise<DriveFile> {
  assertOnline()
  return withAuth(async (token) => {
    const existing = await driveApi.findFolderByName(token, CONTAINER_FOLDER_NAME)
    if (existing) return existing
    return driveApi.createFolder(token, CONTAINER_FOLDER_NAME)
  })
}

// One-time, idempotent: if the container's direct children include anything
// that isn't a folder, this is the old flat single-vault layout — create a
// new vault subfolder and re-parent every existing child into it (a move,
// not a copy, so file ids/revision history/sharing all survive untouched).
// A container whose children are already all folders is left alone.
export async function migrateFlatVaultIfNeeded(containerId: string): Promise<void> {
  assertOnline()
  return withAuth(async (token) => {
    const children = await driveApi.listChildren(token, containerId)
    if (children.length === 0 || children.every((c) => c.mimeType === FOLDER_MIME)) return
    const vaultFolder = await driveApi.createFolder(token, MIGRATION_VAULT_NAME, containerId)
    for (const child of children) {
      await driveApi.moveFile(token, child.id, vaultFolder.id, containerId)
    }
  })
}

export function listVaults(containerId: string): Promise<VaultMeta[]> {
  return withAuth(async (token) => {
    const folders = await driveApi.listFolders(token, containerId)
    return folders.map((f) => ({ id: f.id, name: f.name }))
  })
}

export function createVaultFolder(containerId: string, name: string): Promise<VaultMeta> {
  assertOnline()
  return withAuth(async (token) => {
    const folder = await driveApi.createFolder(token, name, containerId)
    return { id: folder.id, name: folder.name }
  })
}

export function renameVaultFolder(vaultId: string, name: string): Promise<VaultMeta> {
  assertOnline()
  return withAuth(async (token) => {
    const folder = await driveApi.renameFile(token, vaultId, name)
    return { id: folder.id, name: folder.name }
  })
}

function getVaultRootId(): string {
  const rootFolderId = useVaultStore.getState().rootFolderId
  if (!rootFolderId) throw new Error('Vault not loaded yet')
  return rootFolderId
}

export function createNote(name: string, content: string): Promise<DriveFile> {
  assertOnline()
  return withAuth((token) => driveApi.createFile(token, getVaultRootId(), name, content))
}

export function createFolder(name: string): Promise<DriveFile> {
  assertOnline()
  return withAuth((token) => driveApi.createFolder(token, name, getVaultRootId()))
}

export function findOrCreateAssetsFolder(): Promise<DriveFile> {
  assertOnline()
  return withAuth(async (token) => {
    const rootId = getVaultRootId()
    const existing = await driveApi.findFolderByName(token, ASSETS_FOLDER_NAME, rootId)
    if (existing) return existing
    return driveApi.createFolder(token, ASSETS_FOLDER_NAME, rootId)
  })
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'note'
  )
}

// Returns the filename it was stored under (note-title-slug + a short random
// suffix to avoid collisions), which is what callers insert into markdown
// as ![](filename) — more identifiable browsing the assets/ folder directly
// than a raw ${Date.now()}-${file.name} prefix.
export async function uploadImage(file: File): Promise<string> {
  assertOnline()
  const title = useNoteStore.getState().frontmatter.title
  const slug = slugify(typeof title === 'string' ? title : 'note')
  const shortId = Math.random().toString(36).slice(2, 8)
  const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name)
  const ext = extMatch ? extMatch[0] : ''
  const filename = `${slug}-${shortId}${ext}`

  const assets = await findOrCreateAssetsFolder()
  await withAuth((token) => driveApi.uploadBinary(token, assets.id, filename, file))
  return filename
}

// General-purpose version of uploadImage above — that one is tied to
// note.store's currently-*active* note (for its filename-slug source),
// which doesn't make sense for a flow like DOCX import that's creating a
// brand new note and has no "current note" to speak of yet.
export function uploadAttachment(parentId: string, filename: string, blob: Blob): Promise<DriveFile> {
  assertOnline()
  return withAuth((token) => driveApi.uploadBinary(token, parentId, filename, blob))
}

export function listRevisions(fileId: string): Promise<DriveRevision[]> {
  return withAuth((token) => driveApi.listRevisions(token, fileId))
}

export function readRevision(fileId: string, revisionId: string): Promise<string> {
  return withAuth((token) => driveApi.readRevision(token, fileId, revisionId))
}

export function moveFile(fileId: string, newParentId: string, oldParentId: string): Promise<DriveFile> {
  assertOnline()
  return withAuth((token) => driveApi.moveFile(token, fileId, newParentId, oldParentId))
}

export function trashFile(fileId: string): Promise<void> {
  assertOnline()
  return withAuth((token) => driveApi.trashFile(token, fileId))
}
