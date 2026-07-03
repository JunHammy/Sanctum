import { create } from 'zustand'
import * as driveService from '../services/drive.service'
import { renderNote, renderBody, serializeFrontmatter } from '../services/markdown.service'

const AUTO_SAVE_DELAY_MS = 3000

interface NoteState {
  activeNoteId: string | null
  html: string
  rawBody: string
  frontmatterBlock: string
  frontmatter: Record<string, unknown>
  isLoading: boolean
  isReadMode: boolean
  isDirty: boolean
  isSaving: boolean
  error: string | null
  openNote: (fileId: string) => Promise<void>
  updateContent: (newBody: string) => void
  updateFrontmatterField: (key: string, value: unknown) => void
  removeFrontmatterField: (key: string) => void
  toggleReadMode: () => void
  saveNote: () => Promise<void>
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleAutoSave(save: () => void) {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(save, AUTO_SAVE_DELAY_MS)
}

export const useNoteStore = create<NoteState>()((set, get) => ({
  activeNoteId: null,
  html: '',
  rawBody: '',
  frontmatterBlock: '',
  frontmatter: {},
  isLoading: false,
  isReadMode: true,
  isDirty: false,
  isSaving: false,
  error: null,

  openNote: async (fileId) => {
    const current = get()

    // Switching notes with unsaved edits: flush the save immediately rather
    // than losing it (or letting a stale debounce timer fire later against
    // whatever note happens to be open by then).
    if (current.activeNoteId && current.activeNoteId !== fileId && current.isDirty) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
      await current.saveNote()
    }

    // Set activeNoteId immediately so useNote's effect doesn't re-fire on
    // every re-render while this is in flight (or after it fails).
    set({ isLoading: true, error: null, activeNoteId: fileId, isDirty: false, isReadMode: true })
    try {
      const raw = await driveService.readFile(fileId)
      const { html, frontmatter, frontmatterBlock, rawBody } = renderNote(raw)
      set({ html, frontmatter, frontmatterBlock, rawBody, isLoading: false })
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load note' })
    }
  },

  updateContent: (newBody) => {
    set({ rawBody: newBody, html: renderBody(newBody), isDirty: true })
    scheduleAutoSave(() => get().saveNote())
  },

  // Once frontmatter is actually edited, the original verbatim block gets
  // regenerated via serializeFrontmatter() from here on for this note —
  // see the comment on ExtractedFrontmatter in markdown.service.ts for why
  // it starts out verbatim instead of always-regenerated.
  updateFrontmatterField: (key, value) => {
    const nextFrontmatter = { ...get().frontmatter, [key]: value }
    set({ frontmatter: nextFrontmatter, frontmatterBlock: serializeFrontmatter(nextFrontmatter), isDirty: true })
    scheduleAutoSave(() => get().saveNote())
  },

  removeFrontmatterField: (key) => {
    const nextFrontmatter = { ...get().frontmatter }
    delete nextFrontmatter[key]
    set({ frontmatter: nextFrontmatter, frontmatterBlock: serializeFrontmatter(nextFrontmatter), isDirty: true })
    scheduleAutoSave(() => get().saveNote())
  },

  toggleReadMode: () => set((s) => ({ isReadMode: !s.isReadMode })),

  saveNote: async () => {
    const { activeNoteId, frontmatterBlock, rawBody, isDirty } = get()
    if (!activeNoteId || !isDirty) return

    set({ isSaving: true, error: null })
    try {
      await driveService.updateFile(activeNoteId, frontmatterBlock + rawBody)
      set({ isSaving: false, isDirty: false })
    } catch (err) {
      set({ isSaving: false, error: err instanceof Error ? err.message : 'Failed to save note' })
    }
  },
}))
