import { lazy, Suspense } from 'react'
import { useNote } from '../../hooks/useNote'
import { useKeyboardShortcut } from '../../hooks/useKeyboard'
import { useNoteStore } from '../../stores/note.store'
import { MarkdownReader } from './MarkdownReader'
import { ReadEditToggle } from './ReadEditToggle'
import { LoadingSpinner } from '../common/LoadingSpinner'
import { PropertiesPanel } from './PropertiesPanel'

// CodeMirror (~200KB+ gzipped with basicSetup/markdown mode/theme) is only
// needed once the user actually enters edit mode, never for reading — lazy
// loaded the same way Mermaid/Plotly are planned to be, rather than shipping
// it unconditionally in the main bundle.
const MarkdownEditor = lazy(() => import('./MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })))

export function NoteView({ fileId }: { fileId: string }) {
  const { html, frontmatter, isLoading, error } = useNote(fileId)
  const isReadMode = useNoteStore((s) => s.isReadMode)
  const isDirty = useNoteStore((s) => s.isDirty)
  const isSaving = useNoteStore((s) => s.isSaving)
  const rawBody = useNoteStore((s) => s.rawBody)
  const updateContent = useNoteStore((s) => s.updateContent)
  const toggleReadMode = useNoteStore((s) => s.toggleReadMode)
  const saveNote = useNoteStore((s) => s.saveNote)

  useKeyboardShortcut('s', () => saveNote(), { ctrl: true })
  useKeyboardShortcut('e', () => toggleReadMode(), { ctrl: true })

  if (isLoading) return <LoadingSpinner label="Loading note…" />
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {isSaving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'Saved'}
        </span>
        <ReadEditToggle />
      </div>
      <PropertiesPanel frontmatter={frontmatter} />
      {isReadMode ? (
        <MarkdownReader html={html} currentFileId={fileId} />
      ) : (
        <Suspense fallback={<LoadingSpinner label="Loading editor…" />}>
          <MarkdownEditor key={fileId} value={rawBody} onChange={updateContent} />
        </Suspense>
      )}
    </div>
  )
}
