import type { FileTreeNode } from '../types/vault.types'

// Simplified vs. MP §9's "check local folder's assets/, fall back to global
// assets/" — this searches the whole vault by basename instead of walking
// folder scope. Much simpler, and fine as long as attachment filenames are
// reasonably unique across the vault (true in practice for pasted-image
// naming conventions like "timestamp-name.png").
export function findAttachmentByName(nodes: FileTreeNode[], name: string): string | null {
  for (const node of nodes) {
    if (node.type === 'attachment' && node.name === name) return node.id
    if (node.type === 'folder') {
      const found = findAttachmentByName(node.children, name)
      if (found) return found
    }
  }
  return null
}

export function isRelativeImagePath(src: string): boolean {
  return !/^(https?:|data:|blob:)/.test(src)
}
