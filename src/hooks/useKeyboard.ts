import { useEffect } from 'react'

interface ShortcutOptions {
  ctrl?: boolean
  shift?: boolean
}

// Generic global keyboard shortcut — Ctrl on Windows/Linux, Cmd on Mac.
// `shift` defaults to false (required *not* held) rather than "don't care" —
// otherwise Ctrl+Z and Ctrl+Shift+Z would both match e.key "z"/"Z" and fire
// the same handler, since e.key.toLowerCase() collapses the two.
export function useKeyboardShortcut(key: string, callback: () => void, options?: ShortcutOptions) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const ctrlSatisfied = options?.ctrl ? e.ctrlKey || e.metaKey : true
      const shiftSatisfied = e.shiftKey === !!options?.shift
      if (ctrlSatisfied && shiftSatisfied && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault()
        callback()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, callback, options?.ctrl, options?.shift])
}
