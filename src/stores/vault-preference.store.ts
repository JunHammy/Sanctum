import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface VaultPreferenceState {
  activeVaultId: string | null
  setActiveVaultId: (id: string | null) => void
}

// A separate, tiny persisted store rather than folding this into ui.store —
// vault selection has a different lifecycle (should clear on sign-out;
// theme should not), so it doesn't belong in ui.store's partialize.
export const useVaultPreferenceStore = create<VaultPreferenceState>()(
  persist(
    (set) => ({
      activeVaultId: null,
      setActiveVaultId: (id) => set({ activeVaultId: id }),
    }),
    {
      name: 'sanctum-vault-preference',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ activeVaultId: state.activeVaultId }),
    },
  ),
)
