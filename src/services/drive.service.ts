import { useAuthStore } from '../stores/auth.store'
import * as driveApi from '../lib/drive-api'
import { DriveApiError } from '../lib/drive-api'
import type { DriveFile } from '../lib/drive-api'

const VAULT_FOLDER_NAME = 'Sanctum'

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
