import { useState } from 'react'

// Checked once at mount, not reactively — device input capability doesn't
// realistically change mid-session, and re-checking on every resize would
// be wasted work. Hybrid devices (e.g. a laptop with a touchscreen) report
// hover-capable here, which is the right default: mouse/trackpad users on
// those devices still get the richer hover+drag interaction.
export function useIsTouchDevice(): boolean {
  const [isTouch] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(hover: none)').matches
  })
  return isTouch
}
