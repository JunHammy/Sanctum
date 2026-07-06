import { readFile, readFileBlob } from './drive.service'
import { renderNote } from './markdown.service'
import { resolveTransclusionsIn } from '../hooks/useTransclusion'
import { findAttachmentByName, isRelativeImagePath } from '../lib/image-resolver'
import type { FileTreeNode } from '../types/vault.types'

// Exported — shared with docx-export.service.ts, which names its own
// downloaded file the same way.
export function safeFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'note'
}

// Re-fetches fresh from Drive rather than trusting whatever's currently in
// note.store — same reasoning as exportNoteToPDF below, and it keeps both
// export paths consistent (both operate on the last-*saved* version; the
// Header's own "Unsaved changes" indicator is the existing signal for that).
export async function downloadNoteMarkdown(fileId: string, title: string): Promise<void> {
  const raw = await readFile(fileId)
  const blob = new Blob([raw], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFilename(title)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

// A dedicated, fully-awaited image resolver for export — deliberately not
// the shared useImageResolution/resolveImagesIn (that one is fire-and-
// forget by design, built for a live page where a spinner-then-swap is
// fine). Both export formats need to know every image has actually
// finished loading (not just that a fetch started) before rasterizing
// (PDF) or re-encoding (docx) it, so this waits on each <img>'s own
// load/error event too. Exported — shared with docx-export.service.ts via
// buildResolvedNoteContainer below.
export async function resolveImagesForExport(container: HTMLElement, fileTree: FileTreeNode[]): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src || !isRelativeImagePath(src)) return
      const filename = src.split('/').pop()
      if (!filename) return
      const fileId = findAttachmentByName(fileTree, filename)
      if (!fileId) return // leave the broken relative src as-is — one missing image shouldn't fail the whole export

      try {
        const blob = await readFileBlob(fileId)
        img.src = URL.createObjectURL(blob)
        if (img.complete) return
        await new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
      } catch {
        // Leave the broken relative src — same reasoning as the missing-file case above.
      }
    }),
  )
}

// html2canvas fundamentally cannot render native list markers — not a bug
// with a fix, a permanent gap (confirmed: "list styles apparently fall
// outside the currently supported CSS properties," no built-in workaround
// — https://github.com/niklasvh/html2canvas/issues/177). A `<ul>`/`<ol>`'s
// bullets/numbers are painted by the browser from `list-style`, which
// html2canvas's manual DOM walker never sees at all — confirmed in a real
// export, where every list rendered with no markers whatsoever. The only
// reliable fix is to stop relying on `list-style` for the export and
// inject the markers as literal, real DOM text instead (print.css sets
// list-style: none to match, so a marker never appears twice). Skips
// task-list items — markdown-it-task-lists already renders a real
// <input type="checkbox">, which needs no separate text marker in front
// of it. Only handles one level of nesting depth (this note's own content
// is flat lists) — a nested list would need each level tracking its own
// counter, not worth the complexity until an actual note needs it.
function addExplicitListMarkers(container: HTMLElement): void {
  container.querySelectorAll('ul, ol').forEach((list) => {
    const isOrdered = list.tagName === 'OL'
    const start = isOrdered ? Number(list.getAttribute('start') ?? '1') : 0
    let index = 0
    Array.from(list.children).forEach((child) => {
      if (child.tagName !== 'LI') return
      if (child.classList.contains('task-list-item')) return
      const marker = document.createElement('span')
      marker.className = 'pdf-export-marker'
      marker.textContent = isOrdered ? `${start + index}. ` : '• '
      // Some list items (markdown-it-footnote's definitions, confirmed)
      // wrap their text in a <p> rather than holding it directly — inserting
      // the marker as a sibling *before* that <p> put it on its own line
      // instead of inline with the text (a real export showed a footnote's
      // "1." floating alone above its definition). Inserting inside the
      // first block-level child instead keeps the marker genuinely inline
      // with the text it's marking, whatever wraps that text.
      const firstChild = child.firstElementChild
      if (firstChild && getComputedStyle(firstChild).display === 'block') {
        firstChild.insertBefore(marker, firstChild.firstChild)
      } else {
        child.insertBefore(marker, child.firstChild)
      }
      index++
    })
  })
}

// Re-fetches and re-renders the note from scratch rather than reusing
// whatever's currently on screen — works the same regardless of whether
// the note is currently open in Read or Edit mode, and guarantees every
// image and embed is *fully* resolved (not left as an unresolved
// placeholder, or an embed fetch still mid-flight) before either export
// format consumes the container — PDF export rasterizes it as-is, docx
// export walks it into docx's own object model. Exported — shared with
// docx-export.service.ts, so both formats are built from identically
// resolved content, not two independent (and potentially diverging)
// resolution passes.
export async function buildResolvedNoteContainer(fileId: string, fileTree: FileTreeNode[]): Promise<HTMLElement> {
  const raw = await readFile(fileId)
  const { html } = renderNote(raw)
  const container = document.createElement('div')
  container.innerHTML = html
  await resolveTransclusionsIn(container, fileTree)
  // Runs after transclusions resolve, not concurrently with them — an
  // embed's own images don't exist in the DOM to find until its body has
  // actually been injected.
  await resolveImagesForExport(container, fileTree)
  return container
}

export async function exportNoteToPDF(fileId: string, title: string, fileTree: FileTreeNode[]): Promise<void> {
  // Dynamic, not a top-of-file static import — html2pdf.js bundles
  // html2canvas + jsPDF, roughly doubling the main chunk's size for a
  // feature most page loads never touch. Same lazy-loading reasoning as
  // BlockEditor/CodeMirror elsewhere in this codebase (see NoteView.tsx):
  // Vite/Rollup splits this into its own chunk, fetched only the moment
  // someone actually clicks "Export as PDF."
  const { default: html2pdf } = await import('html2pdf.js')
  const container = await buildResolvedNoteContainer(fileId, fileTree)
  container.className = 'markdown-body pdf-export'

  // html2pdf.js 0.14's own clone/capture pipeline has a confirmed bug
  // (https://github.com/eKoopmans/html2pdf.js/issues/804) where the source
  // element coming back *blank* if it (or an ancestor) has position:absolute
  // OR position:fixed — both tried here in turn, both produced a real blank
  // PDF. So this container is left at its default position:static (normal
  // document flow) entirely — instead, an outer wrapper with height:0 and
  // overflow:hidden is what keeps it invisible/non-disruptive on screen,
  // while the container inside it still lays out at full size for capture.
  const wrapper = document.createElement('div')
  wrapper.style.height = '0'
  wrapper.style.overflow = 'hidden'
  wrapper.appendChild(container)
  document.body.appendChild(wrapper)

  try {
    // Needs the container actually attached to the document first (this
    // runs after the appendChild above, not inside buildResolvedNoteContainer)
    // — it reads getComputedStyle, which a detached node can't answer
    // reliably.
    addExplicitListMarkers(container)

    // Assigned to a variable rather than passed as an inline object literal
    // — html2pdf.js's own shipped types don't model `pagebreak`, and this
    // avoids fighting that (TS only excess-property-checks object literals
    // passed directly at a call site, not variables of a wider type).
    const options: {
      margin: [number, number, number, number]
      filename: string
      image: { type: 'jpeg'; quality: number }
      html2canvas: { scale: number; scrollX: number; scrollY: number }
      jsPDF: { unit: string; format: string; orientation: 'portrait' }
      pagebreak: { mode: string[] }
    } = {
      margin: [15, 15, 15, 15],
      filename: `${safeFilename(title)}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      // Defensive, not the actual fix for the blank-PDF bug (that's the
      // position:static + height:0 wrapper above) — just also rules out an
      // unrelated scroll-offset mismatch affecting html2canvas's capture.
      html2canvas: { scale: 2, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      // 'css' only — no 'avoid-all' (confirmed in a real export: it pushed
      // a whole large image onto the next page rather than letting it
      // split, leaving a big blank gap on the page before it) and no
      // 'legacy' either (its naive pixel-slicing ignores element
      // boundaries entirely — confirmed separately: it sliced a heading
      // and an image cleanly in half across a page boundary). 'css' mode
      // paginates by actual DOM position and respects the break-inside
      // rules print.css sets for headings/images/code/tables/callouts, so
      // it's the only mode that avoids both failure modes at once.
      pagebreak: { mode: ['css'] },
    }
    await html2pdf().set(options).from(container).save()
  } finally {
    wrapper.remove()
  }
}
