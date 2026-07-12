import { useEffect, useRef } from 'react'
import { useVaultStore } from '../stores/vault.store'

export function useFileTree() {
  const fileTree = useVaultStore((s) => s.fileTree)
  const isLoading = useVaultStore((s) => s.isLoading)
  const error = useVaultStore((s) => s.error)
  const loadVault = useVaultStore((s) => s.loadVault)
  const hasStarted = useRef(false)

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true
      // Skip if the vault was already loaded by some *other* mounted
      // instance of this hook — confirmed real bug from testing: hasStarted
      // is a ref scoped to this one component instance, not global, so
      // navigating between routes that each call useFileTree() independently
      // (VaultRoute, then HelpRoute) re-triggered a full reload every time,
      // flashing the sidebar through its loading state and re-fetching from
      // Drive for no reason, even though the data was already sitting
      // untouched in the store. containerFolderId is set on every
      // successful loadVault() completion (including the "no vaults yet"
      // and offline-cached-fallback paths) and only reset to null on
      // sign-out — a reliable "has this ever actually finished loading"
      // signal, unlike fileTree.length or activeVaultId, which are both
      // legitimately null/empty for a real, successfully-loaded but
      // vault-less or empty account.
      if (useVaultStore.getState().containerFolderId === null) {
        loadVault()
      }
    }
  }, [loadVault])

  return { fileTree, isLoading, error, refresh: loadVault }
}
