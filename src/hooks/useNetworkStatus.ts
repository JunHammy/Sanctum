import { useEffect, useRef } from 'react'
import { useNetworkStore } from '../stores/network.store'
import { useVaultStore } from '../stores/vault.store'
import { useNoteStore } from '../stores/note.store'
import { useAuthStore } from '../stores/auth.store'
import { useToastStore } from '../stores/toast.store'

// Owns all cross-store reconnect/disconnect orchestration in one place —
// same "one file reaches into several stores from outside their own action
// bodies" pattern vault.store.ts's switchVault already uses for its own
// multi-store reset. Keeps every individual store free of scattered
// `if (!isOnline)` side-effect handling.
export function useNetworkStatus(): void {
  const isOnline = useNetworkStore((s) => s.isOnline)
  const previousIsOnline = useRef(isOnline)

  useEffect(() => {
    if (previousIsOnline.current === isOnline) return
    previousIsOnline.current = isOnline

    if (isOnline) {
      useToastStore.getState().show('Back online', 'success')

      // Only reload if what's currently shown is known-stale/failed —
      // avoids a reload-flash on every brief wifi flap when everything was
      // already showing fresh, healthy data.
      const vaultState = useVaultStore.getState()
      if (vaultState.isOfflineFallback || vaultState.error) {
        useVaultStore.getState().loadVault()
      }

      // Flush a pending offline edit immediately rather than waiting for
      // the next keystroke's 3s autosave debounce.
      if (useNoteStore.getState().isDirty) {
        useNoteStore.getState().saveNote()
      }

      // Retry any refresh that silently no-op'd while offline (see
      // auth.store.ts's scheduleRefresh catch handler).
      const authState = useAuthStore.getState()
      if (authState.isAuthenticated && !authState.needsReconnect) {
        useAuthStore.getState().scheduleRefresh()
      }
    } else {
      useToastStore
        .getState()
        .show("You're offline — browsing cached notes only. Editing is disabled until you reconnect.", 'info')

      if (useNoteStore.getState().isDirty) {
        useToastStore
          .getState()
          .show("This note has unsaved changes — they'll save automatically once you're back online.", 'info')
      }
    }
  }, [isOnline])
}
