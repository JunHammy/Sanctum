const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
  parents?: string[]
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
      fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size,parents)',
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
