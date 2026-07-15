import { create } from 'zustand'
import type KatexNamespace from 'katex'

interface KatexState {
  module: typeof KatexNamespace | null
}

// Deliberately a leaf store — same reasoning as network.store.ts's own
// comment: no imports of other stores, so katex-setup.ts (called from deep
// inside the synchronous markdown-render pipeline) can read
// useKatexStore.getState().module with zero circular-import risk. Not
// persisted — whether the katex chunk has loaded is a live fact about this
// exact page load, never something to remember across reloads.
export const useKatexStore = create<KatexState>()(() => ({ module: null }))
