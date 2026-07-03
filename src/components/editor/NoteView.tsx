import { lazy, Suspense } from 'react'
import { useNote } from '../../hooks/useNote'
import { useKeyboardShortcut } from '../../hooks/useKeyboard'
import { useNoteStore } from '../../stores/note.store'
import { MarkdownReader } from './MarkdownReader'
import { LoadingSpinner } from '../common/LoadingSpinner'
import { PropertiesPanel } from './PropertiesPanel'

// CodeMirror (~200KB+ gzipped with basicSetup/markdown mode/theme) is only
// needed once the user actually enters edit mode, never for reading — lazy
// loaded the same way Mermaid/Plotly are planned to be, rather than shipping
// it unconditionally in the main bundle. BlockEditor splits the note into
// per-block sections (each rendered via the same pipeline as read mode when
// inactive) and internally uses MarkdownEditor for whichever block is
// currently being edited.
const BlockEditor = lazy(() => import('./BlockEditor').then((m) => ({ default: m.BlockEditor })))

export function NoteView({ fileId }: { fileId: string }) {
  const { html, isLoading, error } = useNote(fileId)
  const isReadMode = useNoteStore((s) => s.isReadMode)
  const rawBody = useNoteStore((s) => s.rawBody)
  const updateContent = useNoteStore((s) => s.updateContent)
  const toggleReadMode = useNoteStore((s) => s.toggleReadMode)
  const saveNote = useNoteStore((s) => s.saveNote)
  const undo = useNoteStore((s) => s.undo)
  const redo = useNoteStore((s) => s.redo)
  const undoVersion = useNoteStore((s) => s.undoVersion)

  useKeyboardShortcut('s', () => saveNote(), { ctrl: true })
  useKeyboardShortcut('e', () => toggleReadMode(), { ctrl: true })
  useKeyboardShortcut('z', () => undo(), { ctrl: true })
  useKeyboardShortcut('z', () => redo(), { ctrl: true, shift: true })

  if (isLoading) return <LoadingSpinner label="Loading note…" />
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>

  return (
    <div>
      <PropertiesPanel />
      {isReadMode ? (
        <MarkdownReader html={html} currentFileId={fileId} />
      ) : (
        <Suspense fallback={<LoadingSpinner label="Loading editor…" />}>
          <BlockEditor key={`${fileId}-${undoVersion}`} value={rawBody} onChange={updateContent} />
        </Suspense>
      )}
    </div>
  )
}
