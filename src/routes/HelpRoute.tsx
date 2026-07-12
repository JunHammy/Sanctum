import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Modal } from '../components/common/Modal'
import { renderBody } from '../services/markdown.service'
import { useCharts } from '../hooks/useCharts'
import { useDragScrollTables } from '../hooks/useDragScrollTables'
import { useTableMinWidth } from '../hooks/useTableMinWidth'
import { useTableExpand } from '../hooks/useTableExpand'
import { useFileTree } from '../hooks/useFileTree'
import { useTabsStore, HELP_TAB_ID } from '../stores/tabs.store'
import GUIDE_MARKDOWN from '../content/syntax-guide.md?raw'

// A static reference page, not a real vault note, but rendered inside the
// exact same AppShell every note uses (Header, Sidebar, TabBar all come
// along for free) — registering HELP_TAB_ID as an open tab on mount is
// what makes it show up in the tab strip and behave like any other open
// note (click a sidebar note to navigate away, click back to return here,
// close the tab), rather than being a navigational dead end reachable only
// via the Header link and the browser's own back button. See
// tabs.store.ts's own comment on HELP_TAB_ID, and TabBar.tsx for the
// special-casing that turns this one id into "Syntax Guide" instead of a
// file lookup.
//
// Content is rendered through the exact same renderBody() pipeline every
// note uses, so every live example here (callouts, tables, math, mermaid,
// etc.) is proof it actually works, not just a description. Wikilinks/
// transclusion/media embeds are shown as code blocks instead of live
// examples deliberately — those features are inherently tied to real vault
// content, and faking a resolved link here would be misleading rather than
// helpful.
export function HelpRoute() {
  const containerRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef<HTMLDivElement>(null)
  const { fileTree, isLoading, error, refresh } = useFileTree()
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

  // Same pattern as NoteView.tsx's own openTab(fileId) — registering this
  // once on mount is what keeps the tab bar in sync, without any
  // individual navigation call site (Header's Help link, a bookmark, a
  // direct URL) needing to know about tabs itself.
  useEffect(() => {
    useTabsStore.getState().openTab(HELP_TAB_ID)
  }, [])

  return (
    <AppShell fileTree={fileTree} isLoading={isLoading} error={error} onRefresh={refresh}>
      <div ref={containerRef} className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      <Modal
        isOpen={expandedTableHtml !== null}
        onClose={() => setExpandedTableHtml(null)}
        title="Table (Esc or click outside to close)"
        size="large"
      >
        <div ref={expandedRef} className="markdown-body" dangerouslySetInnerHTML={{ __html: expandedTableHtml ?? '' }} />
      </Modal>
    </AppShell>
  )
}
