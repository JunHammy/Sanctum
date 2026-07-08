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

function findNodeById(nodes: FileTreeNode[], id: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.type === 'folder') {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

// Every note id within `node` — itself if it's a file, or every file
// anywhere in its subtree if it's a folder (attachments excluded, they're
// never tabs). Used when deleting a node to know which open tabs, if any,
// need to close along with it — a folder delete can cascade to several
// open tabs at once, not just the currently active one.
export function collectFileIds(node: FileTreeNode): string[] {
  if (node.type === 'file') return [node.id]
  if (node.type !== 'folder') return []
  return node.children.flatMap(collectFileIds)
}

// True if `descendantId` sits anywhere inside `ancestorId`'s own subtree —
// used to block a folder being dragged into itself or one of its own
// children, which would otherwise silently build an unreachable, self-
// referential tree (and likely infinite-loop buildFileTree's own
// parent-child reconstruction on the next vault load).
export function isDescendantOf(nodes: FileTreeNode[], ancestorId: string, descendantId: string): boolean {
  const ancestor = findNodeById(nodes, ancestorId)
  if (!ancestor || ancestor.type !== 'folder') return false
  return findNodeById(ancestor.children, descendantId) !== null
}
