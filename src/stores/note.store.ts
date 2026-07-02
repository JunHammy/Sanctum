import { create } from 'zustand'
import * as driveService from '../services/drive.service'
import { renderNote } from '../services/markdown.service'

interface NoteState {
  activeNoteId: string | null
  html: string
  frontmatter: Record<string, unknown>
  isLoading: boolean
  error: string | null
  openNote: (fileId: string) => Promise<void>
}

export const useNoteStore = create<NoteState>()((set) => ({
  activeNoteId: null,
  html: '',
  frontmatter: {},
  isLoading: false,
  error: null,

  openNote: async (fileId) => {
    // Set activeNoteId immediately so useNote's effect doesn't re-fire on
    // every re-render while this is in flight (or after it fails).
    set({ isLoading: true, error: null, activeNoteId: fileId })
    try {
      const raw = await driveService.readFile(fileId)
      const { html, frontmatter } = renderNote(raw)
      set({ html, frontmatter, isLoading: false })
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load note' })
    }
  },
}))
