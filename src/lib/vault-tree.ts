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
