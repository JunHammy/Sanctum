import { lazy, Suspense, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useNoteStore } from '../stores/note.store'
import { LoadingSpinner } from '../components/common/LoadingSpinner'

// react-pdf/pdfjs-dist is a substantial dependency (same "big lazy chunk"
// tier as Mermaid/Plotly/Pyodide elsewhere in this app) — deferred the same
// way NoteView.tsx lazy-loads BlockEditor/CodeMirror, so it's never fetched
// unless a PDF tab is actually opened.
const PdfViewer = lazy(() => import('../components/editor/PdfViewer').then((m) => ({ default: m.PdfViewer })))

// AppShell (Header/Sidebar/TabBar) is mounted once by AppShellLayout, the
// shared parent route this renders inside of via <Outlet/> — same shape as
// VaultRoute.tsx, just for a fileId that's a PDF attachment rather than a
// markdown note.
export function PdfRoute() {
  const { fileId } = useParams<{ fileId?: string }>()
  const resetNote = useNoteStore((s) => s.reset)

  // A PDF tab never touches note.store, but Header.tsx's Save status/
  // Version history/Export/Edit-toggle controls are all gated behind its
  // activeNoteId alone — without this, switching from a note tab to a PDF
  // tab left those showing for whatever note was open before.
  useEffect(() => {
    resetNote()
  }, [fileId, resetNote])

  if (!fileId) return <p style={{ color: 'var(--text-muted)' }}>Select a PDF from the sidebar.</p>

  return (
    <Suspense fallback={<LoadingSpinner label="Loading PDF viewer…" />}>
      <PdfViewer fileId={fileId} />
    </Suspense>
  )
}
