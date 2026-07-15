import { lazy, Suspense, useEffect } from 'react'
import { useNote } from '../../hooks/useNote'
import { useKeyboardShortcut } from '../../hooks/useKeyboard'
import { useNoteStore } from '../../stores/note.store'
import { useTabsStore } from '../../stores/tabs.store'
import { toggleReadModePreservingScroll } from '../../lib/scroll-to-line'
import { loadBlockEditor } from '../../lib/prefetch-block-editor'
import { MarkdownReader } from './MarkdownReader'
import { LoadingSpinner } from '../common/LoadingSpinner'
import { Breadcrumbs } from './Breadcrumbs'
import { PropertiesPanel } from './PropertiesPanel'
import { TableOfContents } from './TableOfContents'
import { BacklinksPanel } from './BacklinksPanel'

// CodeMirror (~200KB+ gzipped with basicSetup/markdown mode/theme) is only
// needed once the user actually enters edit mode, never for reading — lazy
// loaded the same way Mermaid/Plotly are planned to be, rather than shipping
// it unconditionally in the main bundle. BlockEditor splits the note into
// per-block sections (each rendered via the same pipeline as read mode when
// inactive) and internally uses MarkdownEditor for whichever block is
// currently being edited.
const BlockEditor = lazy(() => loadBlockEditor().then((m) => ({ default: m.BlockEditor })))

export function NoteView({ fileId }: { fileId: string }) {
  const { html, isLoading, error } = useNote(fileId)
  const isReadMode = useNoteStore((s) => s.isReadMode)
  const rawBody = useNoteStore((s) => s.rawBody)
  const updateContent = useNoteStore((s) => s.updateContent)
  const saveNote = useNoteStore((s) => s.saveNote)
  const undo = useNoteStore((s) => s.undo)
  const redo = useNoteStore((s) => s.redo)
  const undoVersion = useNoteStore((s) => s.undoVersion)

  useKeyboardShortcut('s', () => saveNote(), { ctrl: true })
  useKeyboardShortcut('e', () => toggleReadModePreservingScroll(), { ctrl: true })
  useKeyboardShortcut('z', () => undo(), { ctrl: true })
  useKeyboardShortcut('z', () => redo(), { ctrl: true, shift: true })

  // Every way of opening a note (sidebar click, backlink, tag jump,
  // wikilink, search result, quick switcher) already funnels through this
  // component mounting/updating with a fileId — registering it here once
  // is what keeps the tab bar in sync everywhere, without needing every
  // individual navigate() call site to also know about tabs.
  useEffect(() => {
    useTabsStore.getState().openTab(fileId)
  }, [fileId])

  // AppShell already kicks this prefetch off the moment the authenticated
  // vault shell mounts (before any note is even opened) — this is a
  // fallback for the (rare) case NoteView somehow mounts without AppShell
  // ever having done so. Harmless either way: a dynamic import()'s result
  // is cached by module id, so whichever call fires first does the real
  // fetch and this one just resolves instantly from that cache. Without
  // this class of prefetch, the first-ever toggle to Edit mode could take
  // long enough (chunk download, then mounting a CodeMirror instance per
  // block) that the toggle-preserving scroll restore in scroll-to-line.ts —
  // which already waits correctly for the content to exist — became visible
  // as a jarring "reload to the top, then jump" instead of a clean
  // transition. Fire-and-forget: not awaited, doesn't affect render.
  useEffect(() => {
    loadBlockEditor()
  }, [])

  if (isLoading) return <LoadingSpinner label="Loading note…" />
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>

  return (
    <div>
      <Breadcrumbs fileId={fileId} />
      <PropertiesPanel />
      <TableOfContents />
      {isReadMode ? (
        <MarkdownReader html={html} currentFileId={fileId} />
      ) : (
        <Suspense fallback={<LoadingSpinner label="Loading editor…" />}>
          <BlockEditor key={`${fileId}-${undoVersion}`} value={rawBody} onChange={updateContent} />
        </Suspense>
      )}
      <BacklinksPanel fileId={fileId} />
    </div>
  )
}
