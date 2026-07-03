import { useEffect, useRef, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVaultStore } from '../../stores/vault.store'
import { useNoteStore } from '../../stores/note.store'
import { resolveWikilink } from '../../lib/wikilink-resolver'
import { slugify } from '../../services/markdown.service'
import { findWikilinkTargetLine } from '../../services/search.service'
import { readFile } from '../../services/drive.service'
import { useImageResolution } from '../../hooks/useImageResolution'
import { scrollToLineWithFlash } from '../../lib/scroll-to-line'

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
  const containerRef = useRef<HTMLDivElement>(null)

  useImageResolution(containerRef, fileTree, isVaultLoading)

  // Consumes a scroll target set before navigating here — by a search
  // result (SearchModal) or a cross-note wikilink jump below. The fileId
  // check is load-bearing, not a formality: pendingScroll gets set before
  // navigate() runs, so this effect can fire while `html` still belongs to
  // whatever note was open *before* — comparing against currentFileId
  // (which only reflects this component's real content once NoteView
  // stops showing its loading spinner) means a premature firing against
  // stale content just leaves the target in place instead of consuming it,
  // so it fires again correctly once the right note's content lands.
  useEffect(() => {
    if (!pendingScroll || pendingScroll.fileId !== currentFileId) return
    scrollToLineWithFlash('[data-src-line]', pendingScroll.line)
    setPendingScroll(null)
  }, [pendingScroll, currentFileId, html, setPendingScroll])

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
    <div className="flex items-start gap-1">
      {/* Invisible spacer matching Block.tsx's gutter width exactly (same
          w-7 + gap-1) — without this, the text content column is narrower
          in Edit mode (which reserves that space for the drag handle/add
          button) than in Read mode (which didn't reserve anything),
          causing a visible reflow/width jump on every toggle. */}
      <div className="w-7 shrink-0" aria-hidden="true" />
      <div
        ref={containerRef}
        className="markdown-body min-w-0 flex-1"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
