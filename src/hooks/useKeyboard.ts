import { useEffect } from 'react'

interface ShortcutOptions {
  ctrl?: boolean
}

// Generic global keyboard shortcut — Ctrl on Windows/Linux, Cmd on Mac.
export function useKeyboardShortcut(key: string, callback: () => void, options?: ShortcutOptions) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const ctrlSatisfied = options?.ctrl ? e.ctrlKey || e.metaKey : true
      if (ctrlSatisfied && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault()
        callback()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, callback, options?.ctrl])
}
