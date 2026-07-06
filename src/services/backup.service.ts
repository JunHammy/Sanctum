import type JSZip from 'jszip'
import { readFile, readFileBlob } from './drive.service'
import type { FileTreeNode } from '../types/vault.types'

// Recurses into a JSZip instance already scoped to the right folder path —
// zip.folder(name) returns a new JSZip rooted at that subfolder, so a
// nested node just needs the same treatment one level down, no path-string
// bookkeeping required.
async function addNodeToZip(zip: JSZip, node: FileTreeNode): Promise<void> {
  if (node.type === 'folder') {
    const folder = zip.folder(node.name)
    if (!folder) return
    await Promise.all(node.children.map((child) => addNodeToZip(folder, child)))
    return
  }
  if (node.type === 'file') {
    const raw = await readFile(node.id)
    zip.file(node.name, raw)
    return
  }
  const blob = await readFileBlob(node.id)
  zip.file(node.name, blob)
}

// The one genuine safety net Sanctum has against losing a vault outright:
// there's no server and no database, so Google Drive is the *only* copy of
// any note. A local .zip a user can pull down themselves guards against
// whatever Drive-side mistake (wrong folder deleted, account issue) that
// single copy can't protect against on its own.
export async function exportVaultZip(fileTree: FileTreeNode[]): Promise<void> {
  // Dynamic import, not a top-of-file static one — same lazy-loading
  // reasoning as html2pdf.js/docx elsewhere in this codebase: most page
  // loads never trigger a vault backup.
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  await Promise.all(fileTree.map((node) => addNodeToZip(zip, node)))

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const date = new Date().toISOString().slice(0, 10)
  a.download = `sanctum-vault-backup-${date}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
