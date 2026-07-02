import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

interface UIState {
  sidebarOpen: boolean
  theme: Theme
  toggleSidebar: () => void
  closeSidebar: () => void
  toggleTheme: () => void
}

// Tablets and up (Tailwind's sm breakpoint, 640px) start with the sidebar
// open like desktop; phones start collapsed so content isn't hidden on load.
function getInitialSidebarOpen(): boolean {
  if (typeof window === 'undefined') return true
  return window.innerWidth >= 640
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: getInitialSidebarOpen(),
      theme: 'dark',
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      closeSidebar: () => set({ sidebarOpen: false }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      // Theme preference should survive browser restarts (unlike the auth
      // session), so localStorage rather than sessionStorage. sidebarOpen
      // is intentionally NOT persisted — it's recalculated per viewport.
      name: 'sanctum-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
)
