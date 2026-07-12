import { useMemo, useRef, useState } from 'react'
import { Header } from '../components/layout/Header'
import { GlobalSearchModal } from '../components/search/GlobalSearchModal'
import { Modal } from '../components/common/Modal'
import { renderBody } from '../services/markdown.service'
import { useCharts } from '../hooks/useCharts'
import { useDragScrollTables } from '../hooks/useDragScrollTables'
import { useTableMinWidth } from '../hooks/useTableMinWidth'
import { useTableExpand } from '../hooks/useTableExpand'
import { useKeyboardShortcut } from '../hooks/useKeyboard'
import GUIDE_MARKDOWN from '../content/syntax-guide.md?raw'

// A static reference page, not a real vault note — rendered through the
// exact same renderBody() pipeline every note uses, so every live example
// here (callouts, tables, math, mermaid, etc.) is proof it actually works,
// not just a description. Wikilinks/transclusion/media embeds are shown as
// code blocks instead of live examples deliberately — those features are
// inherently tied to real vault content, and faking a resolved link here
// would be misleading rather than helpful. Search here is the same
// cross-vault GlobalSearchModal the vault manager page uses, since there's
// no single active vault this page belongs to either.
export function HelpRoute() {
  const containerRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  // Same expand-to-fullscreen wiring as MarkdownReader.tsx — the guide's
  // table example describes the expand icon, so it should actually work
  // here too, per this page's own "nothing here is a mockup" principle.
  const [expandedTableHtml, setExpandedTableHtml] = useState<string | null>(null)
  const html = useMemo(() => renderBody(GUIDE_MARKDOWN), [])

  useCharts(containerRef)
  useDragScrollTables(containerRef)
  useTableMinWidth(containerRef)
  useTableExpand(containerRef, setExpandedTableHtml)
  useDragScrollTables(expandedRef)
  useTableMinWidth(expandedRef)
  useKeyboardShortcut('f', () => setSearchOpen(true), { ctrl: true, shift: true })

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header onOpenSearch={() => setSearchOpen(true)} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
          <div ref={containerRef} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <Modal
        isOpen={expandedTableHtml !== null}
        onClose={() => setExpandedTableHtml(null)}
        title="Table (Esc or click outside to close)"
        size="large"
      >
        <div ref={expandedRef} className="markdown-body" dangerouslySetInnerHTML={{ __html: expandedTableHtml ?? '' }} />
      </Modal>
    </div>
  )
}
