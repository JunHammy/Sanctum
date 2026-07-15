import type { FileTreeFolder, FileTreeNode } from '../types/vault.types'

// Matches notes and attachments (e.g. a PDF tab) — folders excluded, since
// folders are never tabs and never need a display-name lookup by id.
export function findFileName(nodes: FileTreeNode[], id: string): string | null {
  for (const node of nodes) {
    if ((node.type === 'file' || node.type === 'attachment') && node.id === id) return node.name
    if (node.type === 'folder') {
      const found = findFileName(node.children, id)
      if (found) return found
    }
  }
  return null
}

// Used when a note is read from Drive to tag the cache.service.ts write-
// through with the modifiedTime it was current as of, matching how
// search.service.ts's buildIndex already tags its own cache writes from the
// flat file list it has on hand — note.store.ts doesn't have that list, only
// vault.store's tree, hence this lookup.
export function findFileModifiedTime(nodes: FileTreeNode[], id: string): string | undefined {
  for (const node of nodes) {
    if (node.type === 'file' && node.id === id) return node.modifiedTime
    if (node.type === 'folder') {
      const found = findFileModifiedTime(node.children, id)
      if (found) return found
    }
  }
  return undefined
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

export function findNodeById(nodes: FileTreeNode[], id: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.type === 'folder') {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

// Every openable-as-a-tab id within `node` — itself if it's a file or
// attachment (a PDF attachment is a real tab, same as a note; other
// attachment types never generate one but including them here is a
// harmless no-op), or every such id anywhere in its subtree if it's a
// folder. Used when deleting a node to know which open tabs, if any, need
// to close along with it — a folder delete can cascade to several open
// tabs at once, not just the currently active one.
export function collectFileIds(node: FileTreeNode): string[] {
  if (node.type === 'file' || node.type === 'attachment') return [node.id]
  if (node.type !== 'folder') return []
  return node.children.flatMap(collectFileIds)
}

// Ordered root-to-parent chain of folders containing `id` — [] for a
// root-level item (no folder segments to show). Used by Breadcrumbs.tsx.
// The inner walk() returns null for "not found in this subtree" rather
// than [] — an id found as a *direct* child of a folder legitimately
// returns an empty path from that point, which would otherwise be
// indistinguishable from "not found here at all."
export function findPathToNode(nodes: FileTreeNode[], id: string): FileTreeFolder[] {
  function walk(items: FileTreeNode[]): FileTreeFolder[] | null {
    for (const node of items) {
      if (node.id === id) return []
      if (node.type === 'folder') {
        const found = walk(node.children)
        if (found !== null) return [node, ...found]
      }
    }
    return null
  }
  return walk(nodes) ?? []
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
