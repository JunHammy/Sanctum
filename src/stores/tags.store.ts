import { create } from 'zustand'
import * as tagsService from '../services/tags.service'
import type { TagMap } from '../services/tags.service'
import type { FileTreeNode } from '../types/vault.types'

interface TagsState {
  isBuilding: boolean
  map: TagMap
  getNoteIdsForTag: (tag: string) => string[]
  buildMap: (fileTree: FileTreeNode[]) => Promise<void>
  updateForNote: (fileId: string, raw: string) => Promise<void>
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
    set({ isBuilding: true })
    try {
      const map = await tagsService.buildTagMap(fileTree)
      set({ map, isBuilding: false })
    } catch {
      set({ isBuilding: false })
    }
  },

  updateForNote: async (fileId, raw) => {
    try {
      const map = await tagsService.updateTagsForNote(get().map, fileId, raw)
      set({ map })
    } catch {
      // A failed incremental update just means this note's tags aren't
      // current until the next full buildMap — not worth surfacing as a
      // save error, since the actual save already succeeded.
    }
  },
}))
