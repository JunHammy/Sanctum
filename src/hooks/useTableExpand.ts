import { useEffect, type RefObject } from 'react'

// Lucide's Maximize2 glyph, hand-copied as a static SVG string — this
// button is injected via raw DOM manipulation below (into content that
// came from dangerouslySetInnerHTML, not React's own tree), so an actual
// <Maximize2 /> component isn't reachable here the way it is in Block.tsx's
// own (separately-implemented) expand button for inactive blocks in Edit
// mode. Kept visually identical to that one on purpose.
const MAXIMIZE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline>' +
  '<line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>'

// Adds a small "expand" button to the corner of every wide, scrollable
// table in a *read-only* rendered view (MarkdownReader's whole-note Read
// mode) — a fullscreen look at a table too big for the reading column,
// with no editing involved. This is deliberately separate from Block.tsx's
// own expand button on inactive table blocks inside Edit mode, which
// activates the block and opens the real editable grid instead; the two
// contexts want genuinely different behavior on click; only this one
// exists purely to view.
//
// The button can't be baked into markdown.service.ts's table_open/
// table_close renderer override (which both Read mode and Block.tsx's
// inactive rendering already share) — doing so would plant this same
// read-only button on top of Block.tsx's own React-managed one, since
// both paths render through the same renderBody(). Scoping it to a
// separate hook, only ever called from MarkdownReader, keeps the two
// concerns from colliding.
//
// :not(.table-expand-ready) keeps this idempotent on every render — no
// dependency array, same convention as useDragScrollTables/useMediaEmbeds
// (Read/Edit toggling and note switching both remount this content from
// scratch). `onExpand` should be a stable reference (a useState setter is)
// so the click listener attached on first sight of a table never closes
// over a stale callback.
export function useTableExpand(containerRef: RefObject<HTMLDivElement | null>, onExpand: (html: string) => void) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.querySelectorAll<HTMLElement>('.table-scroll:not(.table-expand-ready)').forEach((tableScroll) => {
      tableScroll.classList.add('table-expand-ready')

      const wrapper = document.createElement('div')
      wrapper.className = 'table-expand-wrapper'
      tableScroll.parentNode?.insertBefore(wrapper, tableScroll)
      wrapper.appendChild(tableScroll)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'table-expand-btn'
      button.setAttribute('aria-label', 'Expand table')
      button.setAttribute('title', 'Expand table')
      button.innerHTML = MAXIMIZE_SVG
      button.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        // Cloned and stripped of processed-state marker classes
        // (drag-scroll-ready etc.) rather than sending tableScroll's own
        // outerHTML verbatim — otherwise the copy landing in the modal
        // would already look "processed" to useDragScrollTables, which
        // would then skip it and silently leave drag-to-pan broken inside
        // the expanded view.
        const clone = tableScroll.cloneNode(true) as HTMLElement
        clone.classList.remove('drag-scroll-ready', 'table-scroll-dragging', 'table-expand-ready')
        onExpand(clone.outerHTML)
      })
      wrapper.appendChild(button)
    })
  })
}
