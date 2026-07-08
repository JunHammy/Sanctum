import { create } from 'zustand'

interface TabsState {
  openFileIds: string[]
  openTab: (fileId: string) => void
  // Returns the fileId to navigate to next (the tab that was immediately to
  // the left, falling back to the new first tab), or null if none remain —
  // the caller decides what "no tabs left" means for navigation (usually
  // back to the bare /vault route), since this store doesn't know about
  // routing.
  closeTab: (fileId: string) => string | null
  // Closes every id in `ids` at once — a deleted folder can cascade to
  // several open tabs in one action, not just the single active one
  // closeTab already handles. No "next id" return value, unlike closeTab:
  // the caller (FileTreeNode's delete handler) already separately computes
  // whether the currently active note was among the deleted ids and
  // navigates accordingly.
  closeTabs: (ids: string[]) => void
  // Drag-and-drop reordering — moves fileId to sit immediately before or
  // after targetId.
  moveTab: (fileId: string, targetId: string, side: 'before' | 'after') => void
  // Called on vault switch (mirrors note.store's reset) — a different
  // vault's notes have no business staying open as tabs from the last one.
  resetTabs: () => void
}

// Deliberately in-memory only (no persistence) for v1 — a fresh page load
// starts with whatever note the URL points to as the only open tab, same
// as today's behavior. Not wired to any single navigate() call site: every
// note-opening path (sidebar click, backlink, tag jump, wikilink, search
// result) already funnels through NoteView mounting with a fileId, so
// NoteView calling openTab() once is what keeps this in sync everywhere,
// without touching every navigation call site individually.
export const useTabsStore = create<TabsState>()((set, get) => ({
  openFileIds: [],

  openTab: (fileId) => {
    set((s) => (s.openFileIds.includes(fileId) ? s : { openFileIds: [...s.openFileIds, fileId] }))
  },

  closeTab: (fileId) => {
    const { openFileIds } = get()
    const index = openFileIds.indexOf(fileId)
    if (index === -1) return null
    const next = openFileIds.filter((id) => id !== fileId)
    set({ openFileIds: next })
    if (next.length === 0) return null
    return next[Math.max(0, index - 1)]
  },

  closeTabs: (ids) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    set((s) => ({ openFileIds: s.openFileIds.filter((id) => !idSet.has(id)) }))
  },

  moveTab: (fileId, targetId, side) => {
    set((s) => {
      if (fileId === targetId) return s
      const withoutDragged = s.openFileIds.filter((id) => id !== fileId)
      const targetIndex = withoutDragged.indexOf(targetId)
      if (targetIndex === -1) return s
      const insertAt = side === 'before' ? targetIndex : targetIndex + 1
      const next = [...withoutDragged.slice(0, insertAt), fileId, ...withoutDragged.slice(insertAt)]
      return { openFileIds: next }
    })
  },

  resetTabs: () => set({ openFileIds: [] }),
}))
