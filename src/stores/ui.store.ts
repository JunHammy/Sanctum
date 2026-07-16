import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

export const MIN_SIDEBAR_WIDTH = 200
export const MAX_SIDEBAR_WIDTH = 480
export const DEFAULT_SIDEBAR_WIDTH = 256 // matches the old fixed w-64

interface UIState {
  sidebarOpen: boolean
  theme: Theme
  // User-resizable via the drag handle on the sidebar's right edge (VS
  // Code-style), persisted like theme so it survives a reload.
  sidebarWidth: number
  // Which sidebar folders are expanded, keyed by folder id — lifted out of
  // FileTreeNode's local state so it survives re-renders independent of
  // component identity, and so "expand/collapse all" can act on every
  // folder from one place instead of needing to reach into each instance.
  expandedFolderIds: Set<string>
  // Set by Breadcrumbs.tsx right after revealFolders/openSidebar below, and
  // cleared once Sidebar.tsx has scrolled that row into view — same "set an
  // intent, let whichever component can act on it consume it" shape
  // note.store's pendingScrollAnchor already establishes for the analogous
  // "scroll something into view once it exists in the DOM" problem.
  pendingRevealId: string | null
  toggleSidebar: () => void
  openSidebar: () => void
  closeSidebar: () => void
  toggleTheme: () => void
  setSidebarWidth: (width: number) => void
  toggleFolder: (id: string) => void
  expandAll: (folderIds: string[]) => void
  collapseAll: () => void
  // Adds without removing — unlike expandAll (replaces the whole set) or
  // calling toggleFolder per-id (which would collapse an already-open
  // ancestor instead of guaranteeing it stays open). Used to reveal a
  // breadcrumb folder's full ancestor chain without disturbing whatever
  // else the user already had expanded elsewhere in the tree.
  revealFolders: (folderIds: string[]) => void
  setPendingRevealId: (id: string | null) => void
}

// Tablets and up (Tailwind's sm breakpoint, 640px) start with the sidebar
// open like desktop; phones start collapsed so content isn't hidden on load.
function getInitialSidebarOpen(): boolean {
  if (typeof window === 'undefined') return true
  return window.innerWidth >= 640
}

// Sidebar.tsx's mount/unmount is wrapped in Framer Motion's AnimatePresence
// (a 0.18s slide), which only plays cleanly if `sidebarOpen` doesn't flip
// again before that animation finishes. Before mobile swipe gestures
// existed, the only way to toggle this was one deliberate tap on the
// hamburger button — realistically never fast enough to matter. Swiping
// made a rapid open-then-close (or the reverse) physically easy to trigger
// by accident — confirmed via testing as a real bug: a new sidebar instance
// mounting while the previous one was still mid-exit left two overlapping
// copies of the panel visible at once. A short cooldown, slightly longer
// than the animation's own duration, is what closes that window — not a
// general-purpose debounce, just enough to guarantee one transition always
// finishes before the next is allowed to start.
const SIDEBAR_TOGGLE_COOLDOWN_MS = 220
let lastSidebarToggleAt = 0

function canToggleSidebar(): boolean {
  const now = Date.now()
  if (now - lastSidebarToggleAt < SIDEBAR_TOGGLE_COOLDOWN_MS) return false
  lastSidebarToggleAt = now
  return true
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: getInitialSidebarOpen(),
      theme: 'dark',
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      expandedFolderIds: new Set(),
      pendingRevealId: null,
      toggleSidebar: () => {
        if (!canToggleSidebar()) return
        set((s) => ({ sidebarOpen: !s.sidebarOpen }))
      },
      openSidebar: () => {
        if (!canToggleSidebar()) return
        set({ sidebarOpen: true })
      },
      closeSidebar: () => {
        if (!canToggleSidebar()) return
        set({ sidebarOpen: false })
      },
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width)) }),
      toggleFolder: (id) =>
        set((s) => {
          const next = new Set(s.expandedFolderIds)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return { expandedFolderIds: next }
        }),
      expandAll: (folderIds) => set({ expandedFolderIds: new Set(folderIds) }),
      collapseAll: () => set({ expandedFolderIds: new Set() }),
      revealFolders: (folderIds) =>
        set((s) => {
          const next = new Set(s.expandedFolderIds)
          folderIds.forEach((id) => next.add(id))
          return { expandedFolderIds: next }
        }),
      setPendingRevealId: (id) => set({ pendingRevealId: id }),
    }),
    {
      // Theme preference should survive browser restarts (unlike the auth
      // session), so localStorage rather than sessionStorage. sidebarOpen
      // is intentionally NOT persisted — it's recalculated per viewport.
      name: 'sanctum-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme, sidebarWidth: state.sidebarWidth }),
    },
  ),
)
