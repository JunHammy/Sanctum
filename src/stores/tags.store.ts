import { create } from 'zustand'
import * as tagsService from '../services/tags.service'
import type { TagMap } from '../services/tags.service'
import { useVaultStore } from './vault.store'
import type { FileTreeNode } from '../types/vault.types'

interface TagsState {
  isBuilding: boolean
  map: TagMap
  getNoteIdsForTag: (tag: string) => string[]
  buildMap: (fileTree: FileTreeNode[]) => Promise<void>
  updateForNote: (fileId: string, raw: string) => Promise<void>
  // See search.store.ts's reset — clears in-memory state before a vault
  // switch so a stale tag map never bleeds into the newly active vault.
  reset: () => void
}

// Same stable-empty-array rationale as backlinks.store's NO_BACKLINKS — a
// fresh `[]` literal returned from a selector is a new reference every call,
// which useSyncExternalStore treats as a changed snapshot on every render.
const NO_NOTES: string[] = []

export const useTagsStore = create<TagsState>()((set, get) => ({
  isBuilding: false,
  map: new Map(),

  getNoteIdsForTag: (tag) => get().map.get(tag) ?? NO_NOTES,

  buildMap: async (fileTree) => {
    const vaultId = useVaultStore.getState().activeVaultId
    if (!vaultId) return
    set({ isBuilding: true })
    try {
      const map = await tagsService.buildTagMap(fileTree, vaultId)
      // See search.store.ts's buildIndex — a build started for a vault the
      // user has since switched away from must not clobber the newly
      // active vault's already-loaded tag map when it resolves late.
      if (useVaultStore.getState().activeVaultId !== vaultId) return
      set({ map, isBuilding: false })
    } catch {
      if (useVaultStore.getState().activeVaultId === vaultId) set({ isBuilding: false })
    }
  },

  updateForNote: async (fileId, raw) => {
    const vaultId = useVaultStore.getState().activeVaultId
    if (!vaultId) return
    try {
      const map = await tagsService.updateTagsForNote(get().map, fileId, raw, vaultId)
      if (useVaultStore.getState().activeVaultId !== vaultId) return
      set({ map })
    } catch {
      // A failed incremental update just means this note's tags aren't
      // current until the next full buildMap — not worth surfacing as a
      // save error, since the actual save already succeeded.
    }
  },

  reset: () => set({ map: new Map(), isBuilding: false }),
}))
