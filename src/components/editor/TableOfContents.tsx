import { useMemo, useState } from 'react'
import { ChevronRight, List } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useNoteStore } from '../../stores/note.store'
import { findElementNearLine } from '../../lib/scroll-to-line'

interface OutlineItem {
  level: number
  text: string
  id: string
  line: number
}

// Parses the outline straight out of the already-rendered HTML rather than
// re-deriving heading/slug/dedup logic a third time — headingIdPlugin and
// sourceLinePlugin (markdown.service.ts) already stamp every heading with
// both an `id` (unique, deduped) and a `data-src-line`, so reading those
// back guarantees this can never drift from what's actually rendered
// (correct handling of headings inside/outside code fences, repeated
// heading text, etc. all come for free).
function extractOutline(html: string): OutlineItem[] {
  if (!html) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((el) => ({
    level: Number(el.tagName[1]),
    text: el.textContent ?? '',
    id: el.id,
    line: Number(el.getAttribute('data-src-line') ?? -1),
  }))
}

// Sits below PropertiesPanel, above the note content — same collapsible
// chrome as PropertiesPanel/BacklinksPanel for visual consistency. Derived
// from note.store's `html`, which reflects the whole note's structure
// regardless of which mode is currently displayed, so the outline stays
// accurate while editing too, not just while reading.
export function TableOfContents() {
  const html = useNoteStore((s) => s.html)
  const isReadMode = useNoteStore((s) => s.isReadMode)
  // Collapsed by default — you open a note to read it, not to browse its
  // outline first, and a long note's heading list shouldn't be what you
  // have to scroll past to reach the actual content.
  const [expanded, setExpanded] = useState(false)
  const outline = useMemo(() => extractOutline(html), [html])
  // Relative to the note's own shallowest heading, not the literal h1-h6
  // level — a note whose outermost heading is h2 (h1 reserved for the
  // note's own title elsewhere) should still render that heading as the
  // most prominent line, not look like it's already one level nested.
  const minLevel = outline.length > 0 ? Math.min(...outline.map((item) => item.level)) : 1

  // Shows for any note with at least one heading — every new note starts
  // with a `# Title` heading, so this is effectively a default, always-there
  // part of a note's page rather than something that only sometimes
  // appears. Only a genuinely headless note (all headings deleted) hides it.
  if (outline.length === 0) return null

  function handleClick(item: OutlineItem) {
    if (isReadMode) {
      // Same-note heading jump — id already exists in the DOM, no
      // line-number machinery needed (that exists for jumps across a
      // navigation boundary, where the target doesn't exist yet).
      document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (item.line >= 0) {
      findElementNearLine('[data-line]', item.line)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    // Same `-1` scroll-anchor sentinel as PropertiesPanel, and for the same
    // reason: this also never unmounts between Read/Edit, so if a user is
    // scrolled to a point where only this (not Properties) is visible, the
    // toggle-preserving scroll logic in scroll-to-line.ts still has a valid
    // anchor to capture and restore.
    <div className="mb-6 rounded-md border" data-src-line="-1" data-line="-1" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium tracking-wide uppercase hover:opacity-80"
        style={{ color: 'var(--text-muted)' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <motion.span
          className="inline-flex shrink-0"
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronRight size={12} />
        </motion.span>
        <List size={12} />
        Contents
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="toc-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <ul className="flex flex-col px-2 pb-3 text-sm">
              {outline.map((item, i) => {
                const depth = item.level - minLevel
                return (
                  <li key={i}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left transition-colors hover:bg-[var(--bg-tertiary)]"
                      style={{
                        marginLeft: `${depth * 16}px`,
                        color: depth === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: depth === 0 ? 600 : 400,
                        fontSize: depth >= 2 ? '0.8125rem' : undefined,
                      }}
                      onClick={() => handleClick(item)}
                    >
                      {depth > 0 && (
                        <span
                          className="shrink-0 rounded-full"
                          style={{ width: 4, height: 4, background: 'var(--text-muted)' }}
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">{item.text}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
