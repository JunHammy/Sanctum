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

// Browsers only expose dataTransfer's actual *value* on the drop event
// itself — a dragover handler can see that a compatible drag is in
// progress (via dataTransfer.types) but not what's actually being dragged,
// for security reasons. FileTreeNode.tsx's per-row dragover handlers need
// to know the dragged item's type (a file dragged over a folder can only
// ever be moved *into* it, never reordered among sibling folders, and vice
// versa) to pick the right drop zones — this same-window-only mirror of
// the payload is what makes that possible. Set on dragstart, cleared on
// dragend (and defensively on drop) — a drag originating outside this app
// window never sets it, so dragover code must treat null as "unknown,
// fall back to the permissive default".
let draggedPayload: DragPayload | null = null

export function setDraggedPayload(payload: DragPayload | null): void {
  draggedPayload = payload
}

export function getDraggedPayload(): DragPayload | null {
  return draggedPayload
}
