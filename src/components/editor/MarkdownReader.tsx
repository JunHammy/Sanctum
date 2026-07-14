import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVaultStore } from '../../stores/vault.store'
import { useNoteStore } from '../../stores/note.store'
import { resolveWikilink } from '../../lib/wikilink-resolver'
import { slugify } from '../../services/markdown.service'
import { findWikilinkTargetLine } from '../../services/search.service'
import { readFile } from '../../services/drive.service'
import { useImageResolution } from '../../hooks/useImageResolution'
import { useTransclusion } from '../../hooks/useTransclusion'
import { useCharts } from '../../hooks/useCharts'
import { useMediaEmbeds } from '../../hooks/useMediaEmbeds'
import { useDragScrollTables } from '../../hooks/useDragScrollTables'
import { useTableExpand } from '../../hooks/useTableExpand'
import { useTableMinWidth } from '../../hooks/useTableMinWidth'
import { splitAroundCodeBlocks } from '../../lib/split-code-segments'
import { serializePythonBlock } from '../../lib/python/python-syntax'
import { serializeJavaScriptBlock } from '../../lib/javascript/javascript-syntax'
import { CodeBlock, type PersistedCodeOutput } from './CodeBlock'
import { Modal } from '../common/Modal'
import { scrollToLineWithFlash, consumePendingScrollAnchor } from '../../lib/scroll-to-line'

const READ_MODE_SELECTOR = '[data-src-line]'

const FLASH_CLASS = 'heading-flash'
const FLASH_DURATION_MS = 2000

// Same-note jump: the target id already exists in the DOM, so this can
// scroll directly without going through the line-number machinery below
// (which exists specifically for jumps across a navigation boundary,
// where the target DOM doesn't exist yet at click time).
function flashScrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add(FLASH_CLASS)
  setTimeout(() => el.classList.remove(FLASH_CLASS), FLASH_DURATION_MS)
}

interface MarkdownReaderProps {
  html: string
  currentFileId: string
}

// html comes from our own markdown-it pipeline (a note this user wrote), not
// arbitrary third-party content, so injecting it directly is fine here.
export function MarkdownReader({ html, currentFileId }: MarkdownReaderProps) {
  const navigate = useNavigate()
  const fileTree = useVaultStore((s) => s.fileTree)
  const isVaultLoading = useVaultStore((s) => s.isLoading)
  const pendingScroll = useNoteStore((s) => s.pendingScroll)
  const setPendingScroll = useNoteStore((s) => s.setPendingScroll)
  const activeNoteId = useNoteStore((s) => s.activeNoteId)
  const containerRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef<HTMLDivElement>(null)
  // The table currently shown in the fullscreen view, as a raw HTML string
  // cloned from the .table-scroll element the expand button lives on — see
  // useTableExpand for why this stays read-only rather than reusing
  // TableGridEditor: Read mode has no notion of "activate a block" to hand
  // off to.
  const [expandedTableHtml, setExpandedTableHtml] = useState<string | null>(null)

  useImageResolution(containerRef, fileTree, isVaultLoading)
  useTransclusion(containerRef, fileTree)
  useCharts(containerRef)
  useMediaEmbeds(containerRef, fileTree)
  useDragScrollTables(containerRef)
  useTableMinWidth(containerRef)
  useTableExpand(containerRef, setExpandedTableHtml)
  useDragScrollTables(expandedRef)
  useTableMinWidth(expandedRef)

  // Recomputed only when the rendered HTML actually changes, not on every
  // render (this parses the whole string into a detached DOM tree — see
  // split-code-segments.ts for why this exists instead of the portal this
  // app used before).
  const segments = useMemo(() => splitAroundCodeBlocks(html), [html])

  // Splices a completed run's result directly into the note's own rawBody
  // at a block's line range, then saves through the normal updateContent
  // pipeline (undo snapshot, isDirty, autosave scheduling — all already
  // handled there). rawBody is always frontmatter-stripped by the time it
  // reaches this store (renderNote/renderBody both operate on already-
  // extracted content), the same content markdown-it tokenized to produce
  // data-src-line/data-src-line-end in the first place — so these line
  // numbers index directly into it with no offset adjustment.
  function persistOutput(
    language: 'python' | 'javascript',
    code: string,
    startLine: number | null,
    endLine: number | null,
    output: PersistedCodeOutput,
  ) {
    if (startLine === null || endLine === null || Number.isNaN(startLine) || Number.isNaN(endLine)) return
    const { rawBody, updateContent } = useNoteStore.getState()
    const lines = rawBody.split('\n')
    const serialized = language === 'python' ? serializePythonBlock(code, output) : serializeJavaScriptBlock(code, output)
    const nextLines = [...lines.slice(0, startLine), serialized, ...lines.slice(endLine)]
    updateContent(nextLines.join('\n'))
  }

  // Restores scroll position after switching *into* Read mode from Edit
  // (toggleReadModePreservingScroll in scroll-to-line.ts) — a no-op on a
  // plain note load, since there's nothing pending then. Runs once per
  // mount; MarkdownReader is only ever mounted with its real `html` already
  // in place (NoteView shows a loading spinner instead of this component
  // until that's true), so the content this searches over is never partial.
  useLayoutEffect(() => {
    consumePendingScrollAnchor(READ_MODE_SELECTOR)
  }, [])

  // Consumes a scroll target set before navigating here — by a search
  // result (SearchModal), a cross-note wikilink jump below, or the Tag
  // Browser. The fileId check is load-bearing, not a formality — but it
  // compares against note.store's own `activeNoteId`, not the
  // `currentFileId` *prop* (sourced from the URL param). Those two update
  // on different clocks: the URL changes the instant navigate() runs, but
  // `activeNoteId`/`html`/`isLoading` only update together, atomically,
  // once openNote's fetch actually resolves. Comparing against the prop
  // meant there was a real window — one render, right after navigating to
  // a different note — where `currentFileId` already said the new note but
  // `html` still belonged to the old one; the guard passed anyway, fired
  // against the wrong (or about-to-unmount) DOM, found nothing, and still
  // cleared pendingScroll — leaving nothing to trigger the jump once the
  // real content landed a moment later. activeNoteId can't be "ahead" of
  // html this way, since they're set in the same set() call inside openNote.
  useEffect(() => {
    if (!pendingScroll || pendingScroll.fileId !== activeNoteId) return
    scrollToLineWithFlash('[data-src-line]', pendingScroll.line)
    setPendingScroll(null)
  }, [pendingScroll, activeNoteId, html, setPendingScroll])

  async function jumpToOtherNote(fileId: string, heading: string | null, blockId: string | null) {
    // Fetched fresh, not from the IndexedDB content cache — same reasoning
    // as SearchModal's result click: that cache only refreshes on the next
    // full vault reindex, not on every save, so it can be stale enough to
    // miss a recently-added heading or block-id entirely.
    let line: number | null = null
    if (heading || blockId) {
      try {
        const raw = await readFile(fileId)
        line = findWikilinkTargetLine(raw, heading, blockId)
      } catch {
        // Falls through to just opening the note at the top.
      }
    }
    if (line !== null) useNoteStore.getState().setPendingScroll({ fileId, line })
    navigate(`/vault/note/${fileId}`)
  }

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const link = (e.target as HTMLElement).closest('.wikilink')
    if (!link) return
    e.preventDefault()

    const target = link.getAttribute('data-target')
    if (!target) return
    const heading = link.getAttribute('data-heading')
    const blockId = link.getAttribute('data-block')

    const fileId = resolveWikilink(target, fileTree)
    if (!fileId) {
      console.info('Wikilink target not found in vault:', target)
      return
    }

    if (fileId === currentFileId) {
      // Same note: scroll directly, no navigation needed. Block ids are
      // used verbatim (user-authored, already id-safe); headings need the
      // same slugify() the renderer used to generate their id.
      if (heading || blockId) flashScrollToId(blockId || slugify(heading!))
    } else {
      jumpToOtherNote(fileId, heading, blockId)
    }
  }

  return (
    // No longer reserving Block.tsx's w-7 gutter here (a prior deliberate
    // choice to keep Read/Edit pixel-identical, avoiding a reflow on
    // toggle) — confirmed via testing that it was pushing every note's
    // actual text ~32px right of where the header's icons start, reading as
    // "nothing on the page lines up" on every single note, which is a much
    // more constant, visible problem than the brief one-time text shift
    // that now happens when toggling into Edit mode (a deliberate, in-
    // frequent user action, not something seen on every page load).
    <>
      <div
        ref={containerRef}
        // px-2, plain and symmetric by construction (Tailwind's px-* always
        // applies the exact same value to both sides) — a small breathing-room
        // margin now that this no longer relies on the removed gutter spacer.
        className="markdown-body px-2"
        onClick={handleClick}
      >
        {segments.map((segment, i) =>
          segment.type === 'html' ? (
            <div key={i} dangerouslySetInnerHTML={{ __html: segment.html }} />
          ) : (
            <div
              key={i}
              className={`${segment.language}-cell-wrapper overflow-hidden rounded-md border`}
              style={{ borderColor: 'var(--border)' }}
            >
              <div dangerouslySetInnerHTML={{ __html: segment.codeHtml }} />
              {activeNoteId && (
                <CodeBlock
                  language={segment.language}
                  noteId={activeNoteId}
                  blockKey={segment.key}
                  code={segment.code}
                  initialOutput={segment.initialOutput}
                  onPersist={(output) => persistOutput(segment.language, segment.code, segment.startLine, segment.endLine, output)}
                />
              )}
            </div>
          ),
        )}
      </div>
      <Modal
        isOpen={expandedTableHtml !== null}
        onClose={() => setExpandedTableHtml(null)}
        title="Table (Esc or click outside to close)"
        size="large"
      >
        <div ref={expandedRef} className="markdown-body" dangerouslySetInnerHTML={{ __html: expandedTableHtml ?? '' }} />
      </Modal>
    </>
  )
}
