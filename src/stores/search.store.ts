import { create } from 'zustand'
import type MiniSearch from 'minisearch'
import * as searchService from '../services/search.service'
import type { SearchDoc } from '../services/search.service'
import { useVaultStore } from './vault.store'
import { findFileName } from '../lib/vault-tree'
import type { FileTreeNode } from '../types/vault.types'

export interface SearchResultItem {
  id: string
  title: string
  tags: string
  excerpt: string
}

interface SearchState {
  isIndexing: boolean
  index: MiniSearch<SearchDoc> | null
  search: (query: string) => SearchResultItem[]
  buildIndex: (fileTree: FileTreeNode[]) => Promise<void>
  updateIndexForNote: (fileId: string, raw: string) => Promise<void>
  // Clears in-memory state without touching the persisted cache — called
  // right before switching the active vault, so a stale index from the
  // previous vault can never be used as buildIndex's seed for the new one.
  reset: () => void
}

export const useSearchStore = create<SearchState>()((set, get) => ({
  isIndexing: false,
  index: null,

  // Synchronous by design — the index is already in memory once built, so
  // there's no reason to make the typing-as-you-search path async.
  search: (query) => {
    const index = get().index
    if (!index || !query.trim()) return []
    return index.search(query).slice(0, 20).map((hit) => ({
      id: String(hit.id),
      title: String(hit.title ?? ''),
      tags: String(hit.tags ?? ''),
      excerpt: String(hit.excerpt ?? ''),
    }))
  },

  buildIndex: async (fileTree) => {
    // Fire-and-forget from vault.store's loadVault — this shouldn't block
    // the sidebar from rendering, so failures here are swallowed rather
    // than surfaced as a vault-level error. Search just won't have results
    // yet if it fails; the next successful vault load retries.
    const vaultId = useVaultStore.getState().activeVaultId
    if (!vaultId) return
    set({ isIndexing: true })
    try {
      const seed = get().index ?? (await searchService.loadCachedIndex(vaultId))
      const index = await searchService.buildIndex(fileTree, seed, vaultId)
      // The active vault can change mid-flight (switching again before a
      // slow first build finishes) — a build that started for the OLD
      // vault must not clobber whatever the newly active vault already
      // loaded once it finally resolves. Confirmed as a real bug: without
      // this guard, searching in vault B could return vault A's results if
      // A's index was still building when the switch to B happened.
      if (useVaultStore.getState().activeVaultId !== vaultId) return
      set({ index, isIndexing: false })
    } catch {
      if (useVaultStore.getState().activeVaultId === vaultId) set({ isIndexing: false })
    }
  },

  updateIndexForNote: async (fileId, raw) => {
    const vaultId = useVaultStore.getState().activeVaultId
    if (!vaultId) return
    const fileTree = useVaultStore.getState().fileTree
    const name = findFileName(fileTree, fileId) ?? fileId
    try {
      const index = await searchService.updateIndexForNote(get().index, fileId, name, raw, fileTree, vaultId)
      if (useVaultStore.getState().activeVaultId !== vaultId) return
      set({ index })
    } catch {
      // A failed incremental update just means this one note's new content
      // isn't searchable until the next full buildIndex — not worth
      // surfacing as a save error, since the actual save already succeeded.
    }
  },

  reset: () => set({ index: null, isIndexing: false }),
}))
