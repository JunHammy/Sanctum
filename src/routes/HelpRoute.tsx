import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../components/common/Modal'
import { renderBody } from '../services/markdown.service'
import { useCharts } from '../hooks/useCharts'
import { useDragScrollTables } from '../hooks/useDragScrollTables'
import { useTableMinWidth } from '../hooks/useTableMinWidth'
import { useTableExpand } from '../hooks/useTableExpand'
import { useTabsStore, HELP_TAB_ID } from '../stores/tabs.store'
import { useKatexStore } from '../stores/katex.store'
import { splitAroundCodeBlocks } from '../lib/split-code-segments'
import { CodeBlock } from '../components/editor/CodeBlock'
import GUIDE_MARKDOWN from '../content/syntax-guide.md?raw'

// A static reference page, not a real vault note, but rendered inside the
// same shared AppShell every note uses (Header, Sidebar, TabBar all come
// along for free via AppShellLayout, the parent route this renders inside
// of — see that file's own comment) — registering HELP_TAB_ID as an open
// tab on mount is what makes it show up in the tab strip and behave like
// any other open note (click a sidebar note to navigate away, click back
// to return here, close the tab), rather than being a navigational dead
// end reachable only via the Header link and the browser's own back
// button. See tabs.store.ts's own comment on HELP_TAB_ID, and TabBar.tsx
// for the special-casing that turns this one id into "Syntax Guide"
// instead of a file lookup.
//
// Content is rendered through the exact same renderBody() pipeline every
// note uses, so every live example here (callouts, tables, math, mermaid,
// python/javascript, etc.) is proof it actually works, not just a
// description. Wikilinks/transclusion/media embeds are shown as code
// blocks instead of live examples deliberately — those features are
// inherently tied to real vault content, and faking a resolved link here
// would be misleading rather than helpful.
export function HelpRoute() {
  const containerRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef<HTMLDivElement>(null)
  // Same expand-to-fullscreen wiring as MarkdownReader.tsx — the guide's
  // table example describes the expand icon, so it should actually work
  // here too, per this page's own "nothing here is a mockup" principle.
  const [expandedTableHtml, setExpandedTableHtml] = useState<string | null>(null)
  // katexLoaded in the dependency array (unused otherwise) — AppShell's own
  // prefetch self-heals a note's own html once katex loads, but this page
  // renders through its own separate useMemo, not note.store, so it needs
  // the same re-render trigger applied directly here instead.
  const katexLoaded = useKatexStore((s) => s.module !== null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => renderBody(GUIDE_MARKDOWN), [katexLoaded])
  // Same HTML-splitting MarkdownReader uses to mount a real, sibling
  // <CodeBlock> next to each runnable python/javascript example instead of
  // portaling into the rendered HTML (see split-code-segments.ts's own
  // comment for why that's specifically the pattern to avoid) — the guide's
  // examples get a genuine, clickable Run button, not just syntax-
  // highlighted text claiming one exists.
  const segments = useMemo(() => splitAroundCodeBlocks(html), [html])

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
    <>
      <div ref={containerRef} className="markdown-body">
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
              {/* HELP_TAB_ID as the kernel key (not a real note id — this
                  page has no editable Drive note to persist into) gives the
                  guide's own examples a stable, always-available kernel
                  that survives navigating away and back, same lifecycle a
                  real note's kernel gets. No onPersist — GUIDE_MARKDOWN is
                  a static build-time import, not something writable, so a
                  run's result just lives in the kernel store for this
                  session, same as any note's would before its first save. */}
              <CodeBlock
                language={segment.language}
                noteId={HELP_TAB_ID}
                blockKey={segment.key}
                code={segment.code}
                initialOutput={segment.initialOutput}
              />
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
