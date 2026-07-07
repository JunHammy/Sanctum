// Shared between FileTreeNode.tsx (every note/folder row, both a drag
// source and — for folders — a drop target) and Sidebar.tsx (the vault
// root itself as a drop target, for moving something back out of whatever
// folder it's currently nested in).
export const DRAG_MIME = 'application/x-sanctum-note'

export interface DragPayload {
  fileId: string
  parentId: string
  // Folders are drag sources too (for nesting one folder inside another),
  // not just drop targets — a drop handler needs to know which kind it
  // received to run the cycle-prevention check only where it's actually
  // meaningful (a note can never contain a folder, so it never needs that
  // check).
  type: 'note' | 'folder'
}
