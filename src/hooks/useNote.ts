import { useEffect } from 'react'
import { useNoteStore } from '../stores/note.store'

export function useNote(fileId: string | undefined) {
  const activeNoteId = useNoteStore((s) => s.activeNoteId)
  const html = useNoteStore((s) => s.html)
  const frontmatter = useNoteStore((s) => s.frontmatter)
  const isLoading = useNoteStore((s) => s.isLoading)
  const error = useNoteStore((s) => s.error)
  const openNote = useNoteStore((s) => s.openNote)

  useEffect(() => {
    if (fileId && fileId !== activeNoteId) {
      openNote(fileId)
    }
  }, [fileId, activeNoteId, openNote])

  return { html, frontmatter, isLoading, error }
}
