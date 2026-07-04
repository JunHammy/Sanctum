import { create } from 'zustand'
import * as backlinksService from '../services/backlinks.service'
import type { BacklinkMap } from '../services/backlinks.service'
import type { FileTreeNode } from '../types/vault.types'

interface BacklinksState {
  isBuilding: boolean
  map: BacklinkMap
  getBacklinks: (fileId: string) => string[]
  buildMap: (fileTree: FileTreeNode[]) => Promise<void>
  updateForNote: (fileId: string, raw: string, fileTree: FileTreeNode[]) => Promise<void>
}

// A fresh `[] ` literal returned from a selector is a new reference every
// call — components reading it via useBacklinksStore(s => s.getBacklinks(id))
// would then see a "changed" snapshot on every render even when nothing
// changed, which useSyncExternalStore treats as reason to re-render again,
// forever ("Maximum update depth exceeded"). One shared, stable reference
// for the no-backlinks case avoids that.
const NO_BACKLINKS: string[] = []

export const useBacklinksStore = create<BacklinksState>()((set, get) => ({
  isBuilding: false,
  map: new Map(),

  getBacklinks: (fileId) => get().map.get(fileId) ?? NO_BACKLINKS,

  buildMap: async (fileTree) => {
    // Fire-and-forget from vault.store's loadVault, same as search — this
    // shouldn't block the sidebar from rendering, and a failure here just
    // means the Linked mentions panel stays empty until the next load.
    set({ isBuilding: true })
    try {
      const map = await backlinksService.buildBacklinkMap(fileTree)
      set({ map, isBuilding: false })
    } catch {
      set({ isBuilding: false })
    }
  },

  updateForNote: async (fileId, raw, fileTree) => {
    try {
      const map = await backlinksService.updateBacklinksForNote(get().map, fileId, raw, fileTree)
      set({ map })
    } catch {
      // A failed incremental update just means this note's outgoing links
      // aren't current until the next full buildMap — not worth surfacing
      // as a save error, since the actual save already succeeded.
    }
  },
}))
