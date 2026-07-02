const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
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
