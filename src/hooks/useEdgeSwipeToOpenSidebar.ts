import { useEffect, useRef } from 'react'
import { useUIStore } from '../stores/ui.store'

const EDGE_ZONE_PX = 24
const OPEN_THRESHOLD_PX = 60
const VERTICAL_RESTRAINT_PX = 75
// Matches Tailwind's `lg:` breakpoint — the same one every other sidebar-
// collapse check in this app already keys off (FileTreeNode's closeSidebar
// call, Sidebar's own `lg:relative` overlay-vs-column split).
const MOBILE_BREAKPOINT_PX = 1024

// A left-edge swipe-to-open is expected mobile-drawer behavior (matches a
// native app's own edge-swipe navigation) the hamburger button alone
// didn't offer. Plain `window` listeners, not React touch props — this
// needs to fire regardless of what's rendered under the touch, not just
// on one specific element. Desktop is naturally excluded twice over: a
// mouse never fires `touchstart` at all, and the width check below also
// guards a touch-capable laptop/tablet wide enough that the sidebar
// already renders as a static column rather than an overlay worth swiping
// open.
export function useEdgeSwipeToOpenSidebar() {
  const startRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    function handleTouchStart(e: globalThis.TouchEvent) {
      if (useUIStore.getState().sidebarOpen) return
      if (window.innerWidth >= MOBILE_BREAKPOINT_PX) return
      const touch = e.touches[0]
      if (touch.clientX > EDGE_ZONE_PX) return
      startRef.current = { x: touch.clientX, y: touch.clientY }
    }

    function handleTouchMove(e: globalThis.TouchEvent) {
      const start = startRef.current
      if (!start) return
      const touch = e.touches[0]
      const deltaX = touch.clientX - start.x
      const deltaY = touch.clientY - start.y
      if (deltaX < OPEN_THRESHOLD_PX || Math.abs(deltaY) > VERTICAL_RESTRAINT_PX) return
      startRef.current = null
      useUIStore.getState().openSidebar()
    }

    function handleTouchEnd() {
      startRef.current = null
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])
}
