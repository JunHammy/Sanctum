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
      loadVault()
    }
  }, [loadVault])

  return { fileTree, isLoading, error, refresh: loadVault }
}
