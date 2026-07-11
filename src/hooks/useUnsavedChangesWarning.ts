import { useEffect } from 'react'
import { useNoteStore } from '../stores/note.store'

// A real native browser confirmation dialog ("Leave site? Changes you made
// may not be saved") on reload/close/navigate-away while a note has unsaved
// edits — not a custom toast, because `beforeunload` is the only hook the
// browser gives a page to actually intercept navigation, and it only works
// with this exact synchronous API (return a string / set e.returnValue).
// There's deliberately no "hold the reload until it's saved" version of
// this: browsers don't allow a page to indefinitely block navigation for
// an async operation to finish (a real security constraint, not a choice
// made here) — the confirmation dialog, letting the user themselves choose
// to cancel and wait, is the actual mechanism available.
//
// Reads isDirty fresh inside the handler via getState() rather than
// subscribing reactively — this needs exactly one listener for the whole
// app's lifetime, not one that gets torn down and re-added on every
// keystroke-driven isDirty flip.
export function useUnsavedChangesWarning(): void {
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!useNoteStore.getState().isDirty) return
      e.preventDefault()
      // Chrome/Firefox show their own generic message regardless of this
      // value — setting it is just the legacy signal required to trigger
      // the prompt at all.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])
}
