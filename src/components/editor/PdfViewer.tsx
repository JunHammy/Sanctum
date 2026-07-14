import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useVaultStore } from '../../stores/vault.store'
import { useTabsStore } from '../../stores/tabs.store'
import { resolvePdfBlobUrl } from '../../lib/pdf-blob-cache'
import { findFileName } from '../../lib/vault-tree'
import { LoadingSpinner } from '../common/LoadingSpinner'

// Must be set in this same module, not a shared setup file — react-pdf's
// own README is explicit that setting it elsewhere risks module-execution-
// order overwriting it back to the default before <Document>/<Page> ever
// render (see react-pdf/README.md's "Support for a worker" section).
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

// Mirrors NoteView.tsx's own shape (tab registration, loading/error states)
// for a fileId that's a PDF attachment rather than a markdown note — no
// note.store involvement at all, this never goes through the markdown
// render pipeline. Every page renders directly into the content flow
// (react-pdf's <Page>, one per page, at the container's own width) rather
// than delegating to the browser's native PDF viewer via an <iframe> — that
// first version worked but boxed the document into a small, separately-
// scrolling region with its own toolbar/thumbnail chrome, on top of
// ContentPane's own scroll. This way there's exactly one scrollbar, and the
// PDF fills the reading column like any other content.
export function PdfViewer({ fileId }: { fileId: string }) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [width, setWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const name = findFileName(fileTree, fileId) ?? 'PDF'

  // Same call site NoteView.tsx uses to keep tabs.store in sync — every
  // way of opening a PDF (sidebar click, tab click) funnels through this
  // component mounting/updating with a fileId.
  useEffect(() => {
    useTabsStore.getState().openTab(fileId)
  }, [fileId])

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setError(null)
    setNumPages(0)
    resolvePdfBlobUrl(fileId)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this PDF.')
      })
    return () => {
      cancelled = true
    }
  }, [fileId])

  // Pages render at the container's own measured width (same
  // ResizeObserver technique TableGridEditor.tsx already uses) so they
  // fill the reading column and stay responsive to sidebar toggle/window
  // resize — react-pdf's <Page> needs an explicit pixel width, it doesn't
  // size itself off CSS percentages on its own.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>

  return (
    <div ref={containerRef} aria-label={name}>
      {!(url && width > 0) && <LoadingSpinner label="Loading PDF…" />}
      {url && width > 0 && (
        <Document
          file={url}
          onLoadSuccess={({ numPages: loaded }) => setNumPages(loaded)}
          onLoadError={() => setError('Could not load this PDF.')}
          loading={<LoadingSpinner label="Loading PDF…" />}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={i}
              className="mb-4 overflow-hidden rounded-md border shadow-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <Page pageNumber={i + 1} width={width} />
            </div>
          ))}
        </Document>
      )}
    </div>
  )
}
