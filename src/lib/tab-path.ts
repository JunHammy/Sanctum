import { HELP_TAB_ID } from '../stores/tabs.store'
import { findNodeById } from './vault-tree'
import type { FileTreeNode } from '../types/vault.types'

export function isPdfTab(id: string, fileTree: FileTreeNode[]): boolean {
  const node = findNodeById(fileTree, id)
  return node?.type === 'attachment' && node.mimeType === 'application/pdf'
}

// The Help tab id (see tabs.store.ts) maps to a fixed path; a PDF
// attachment maps to its own viewer route; everything else is a real note
// — open/close/reorder/active-highlight (TabBar.tsx) and swipe-to-switch
// (useSwipeTabs.ts) all reuse this exact same resolution logic regardless
// of which of the three a given tab id turns out to be.
export function tabPath(id: string, fileTree: FileTreeNode[]): string {
  if (id === HELP_TAB_ID) return '/help'
  return isPdfTab(id, fileTree) ? `/vault/pdf/${id}` : `/vault/note/${id}`
}
