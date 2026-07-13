const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'
export const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
  parents?: string[]
  // Drive custom metadata — properties are always string-valued, so the
  // reorder feature's fractional-index `order` is stored as a stringified
  // number here (see setFileOrder / vault.store.ts's buildFileTree).
  properties?: Record<string, string>
}

export class DriveApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DriveApiError'
    this.status = status
  }
}

async function request(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  })
  if (!res.ok) {
    throw new DriveApiError(res.status, await res.text())
  }
  return res.json()
}

// Single flat listing + client-side tree reconstruction from `parents`,
// rather than one API call per folder (MP §5.3 performance note).
export async function listAllFiles(token: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      q: 'trashed = false',
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size,parents,properties)',
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const data = await request(token, `${DRIVE_API_BASE}/files?${params.toString()}`)
    files.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)

  return files
}

export async function findFolderByName(token: string, name: string, parentId = 'root'): Promise<DriveFile | null> {
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`
  const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType)' })
  const data = await request(token, `${DRIVE_API_BASE}/files?${params.toString()}`)
  return data.files[0] ?? null
}

export async function createFolder(token: string, name: string, parentId = 'root'): Promise<DriveFile> {
  return request(token, `${DRIVE_API_BASE}/files?fields=id,name,mimeType`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  })
}

// All direct child folders of parentId, unfiltered by name — used for vault
// discovery (each vault is a subfolder of the "Sanctum" container).
export async function listFolders(token: string, parentId: string): Promise<DriveFile[]> {
  const q = `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`
  const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType)' })
  const data = await request(token, `${DRIVE_API_BASE}/files?${params.toString()}`)
  return data.files
}

// Every direct child of parentId regardless of type — used only for the
// one-time flat-vault migration check (does this folder hold loose notes,
// i.e. is it the old single-vault layout, or only vault subfolders already).
export async function listChildren(token: string, parentId: string): Promise<DriveFile[]> {
  const q = `'${parentId}' in parents and trashed = false`
  const params = new URLSearchParams({ q, fields: 'files(id,name,mimeType,parents)' })
  const data = await request(token, `${DRIVE_API_BASE}/files?${params.toString()}`)
  return data.files
}

export async function renameFile(token: string, fileId: string, name: string): Promise<DriveFile> {
  return request(token, `${DRIVE_API_BASE}/files/${fileId}?fields=id,name,mimeType`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

// Fractional-index sort key for manual drag-reorder, persisted as a Drive
// custom property rather than a new `.vault/config.json` — cheap PATCH,
// same shape renameFile already uses. Properties are string-valued only,
// so the number is stringified here and parsed back in buildFileTree.
export async function setFileOrder(token: string, fileId: string, order: number): Promise<DriveFile> {
  return request(token, `${DRIVE_API_BASE}/files/${fileId}?fields=id,name,mimeType,properties`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { order: String(order) } }),
  })
}

export async function readFile(token: string, fileId: string): Promise<string> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new DriveApiError(res.status, await res.text())
  }
  return res.text()
}

export async function readFileBlob(token: string, fileId: string): Promise<Blob> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new DriveApiError(res.status, await res.text())
  }
  return res.blob()
}

export async function updateFile(token: string, fileId: string, content: string): Promise<DriveFile> {
  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/markdown' },
    body: content,
  })
  if (!res.ok) {
    throw new DriveApiError(res.status, await res.text())
  }
  return res.json()
}

export async function createFile(token: string, parentId: string, name: string, content: string): Promise<DriveFile> {
  const metadata = { name, parents: [parentId], mimeType: 'text/markdown' }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', new Blob([content], { type: 'text/markdown' }))

  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) {
    throw new DriveApiError(res.status, await res.text())
  }
  return res.json()
}

export interface DriveRevision {
  id: string
  modifiedTime: string
  size?: string
}

export async function listRevisions(token: string, fileId: string): Promise<DriveRevision[]> {
  const data = await request(
    token,
    `${DRIVE_API_BASE}/files/${fileId}/revisions?fields=revisions(id,modifiedTime,size)`,
  )
  return data.revisions ?? []
}

export async function readRevision(token: string, fileId: string, revisionId: string): Promise<string> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}/revisions/${revisionId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new DriveApiError(res.status, await res.text())
  }
  return res.text()
}

export async function moveFile(
  token: string,
  fileId: string,
  newParentId: string,
  oldParentId: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({ addParents: newParentId, removeParents: oldParentId, fields: 'id,parents' })
  return request(token, `${DRIVE_API_BASE}/files/${fileId}?${params.toString()}`, { method: 'PATCH' })
}

// Soft delete (trashed: true), not the permanent DELETE endpoint — matches
// Drive's own web UI convention (moves to Trash, recoverable there) rather
// than an unrecoverable hard delete. Trashing a folder cascades to
// everything inside it automatically on Drive's side, same as trashing one
// from drive.google.com directly.
export async function trashFile(token: string, fileId: string): Promise<void> {
  await request(token, `${DRIVE_API_BASE}/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  })
}

// No separate mimeType param — the blob's own .type already carries this
// (browsers set it correctly for pasted/dropped files), so a second
// parameter for the same information would just be dead weight.
export async function uploadBinary(token: string, parentId: string, name: string, blob: Blob): Promise<DriveFile> {
  const metadata = { name, parents: [parentId] }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', blob, name)

  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) {
    throw new DriveApiError(res.status, await res.text())
  }
  return res.json()
}
