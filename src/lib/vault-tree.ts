import type { FileTreeNode } from '../types/vault.types'

export function findFileName(nodes: FileTreeNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.type === 'file' && node.id === id) return node.name
    if (node.type === 'folder') {
      const found = findFileName(node.children, id)
      if (found) return found
    }
  }
  return null
}

// Every folder id in the tree, recursively — used to drive "expand/collapse
// all" (ui.store's expandAll needs the full set to expand into).
export function collectFolderIds(nodes: FileTreeNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.type !== 'folder') continue
    ids.push(node.id, ...collectFolderIds(node.children))
  }
  return ids
}
