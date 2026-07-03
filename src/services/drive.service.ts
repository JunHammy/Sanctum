import { useAuthStore } from '../stores/auth.store'
import { useVaultStore } from '../stores/vault.store'
import { useNoteStore } from '../stores/note.store'
import * as driveApi from '../lib/drive-api'
import { DriveApiError } from '../lib/drive-api'
import type { DriveFile, DriveRevision } from '../lib/drive-api'

const VAULT_FOLDER_NAME = 'Sanctum'
const ASSETS_FOLDER_NAME = 'assets'

function getToken(): string {
  const token = useAuthStore.getState().token
  if (!token) throw new Error('Not signed in')
  return token
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
  return withAuth((token) => driveApi.updateFile(token, fileId, content))
}

export function findOrCreateVaultFolder(): Promise<DriveFile> {
  return withAuth(async (token) => {
    const existing = await driveApi.findFolderByName(token, VAULT_FOLDER_NAME)
    if (existing) return existing
    return driveApi.createFolder(token, VAULT_FOLDER_NAME)
  })
}

function getVaultRootId(): string {
  const rootFolderId = useVaultStore.getState().rootFolderId
  if (!rootFolderId) throw new Error('Vault not loaded yet')
  return rootFolderId
}

export function createNote(name: string, content: string): Promise<DriveFile> {
  return withAuth((token) => driveApi.createFile(token, getVaultRootId(), name, content))
}

export function createFolder(name: string): Promise<DriveFile> {
  return withAuth((token) => driveApi.createFolder(token, name, getVaultRootId()))
}

export function findOrCreateAssetsFolder(): Promise<DriveFile> {
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

export function listRevisions(fileId: string): Promise<DriveRevision[]> {
  return withAuth((token) => driveApi.listRevisions(token, fileId))
}

export function readRevision(fileId: string, revisionId: string): Promise<string> {
  return withAuth((token) => driveApi.readRevision(token, fileId, revisionId))
}

export function moveFile(fileId: string, newParentId: string, oldParentId: string): Promise<DriveFile> {
  return withAuth((token) => driveApi.moveFile(token, fileId, newParentId, oldParentId))
}
