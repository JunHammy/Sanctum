import { useRef } from 'react'
import type { TouchEvent } from 'react'

interface SwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  // Minimum horizontal distance (px) before this counts as a swipe at all.
  threshold?: number
  // Maximum vertical drift (px) still allowed for the gesture to count as
  // horizontal — keeps an ordinary vertical scroll (reading a long note,
  // scrolling the sidebar's file list) from misfiring as a swipe just
  // because a finger wasn't held perfectly straight.
  restraint?: number
}

const DEFAULT_THRESHOLD = 60
const DEFAULT_RESTRAINT = 75

// Discrete, end-of-gesture detection (compares touchstart to touchend) —
// deliberately not a live, per-frame-tracked drag. Every consumer of this
// hook fires a one-shot action (open/close a panel, switch tabs) rather
// than needing to visually follow the finger mid-swipe, so the extra
// complexity of state-driven live tracking isn't earned here. (The one
// swipe gesture that DOES need to visually follow the finger — the sidebar
// row's swipe-to-reveal-delete — implements its own local drag tracking
// directly in FileTreeNode.tsx instead of using this hook, for that reason.)
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  threshold = DEFAULT_THRESHOLD,
  restraint = DEFAULT_RESTRAINT,
}: SwipeOptions) {
  const startRef = useRef<{ x: number; y: number } | null>(null)

  function onTouchStart(e: TouchEvent) {
    const touch = e.touches[0]
    startRef.current = { x: touch.clientX, y: touch.clientY }
  }

  function onTouchEnd(e: TouchEvent) {
    const start = startRef.current
    startRef.current = null
    if (!start) return
    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < threshold || Math.abs(deltaY) > restraint) return
    if (deltaX < 0) onSwipeLeft?.()
    else onSwipeRight?.()
  }

  return { onTouchStart, onTouchEnd }
}
