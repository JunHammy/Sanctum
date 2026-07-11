import { useEffect, type RefObject } from 'react'

// Lets a wide table's own horizontal scroll be panned by clicking and
// dragging anywhere in the table, not just via the native scrollbar —
// which on a tall table sits at the very bottom, out of reach until
// you've already scrolled all the way down to it and back up again.
// Targets any `.table-scroll`-classed element: both the read-only wrapper
// markdown.service.ts's table_open/table_close renderer override adds
// around every rendered table, and TableGridEditor's own edit-mode scroll
// wrapper (which opts into the same class specifically to reuse this).
//
// :not(.drag-scroll-ready) keeps this idempotent on every render — no
// dependency array, same reasoning as useMediaEmbeds/useTransclusion:
// Block.tsx's active/inactive swap and NoteView's Read/Edit toggle both
// remount this content from scratch, so a fresh unprocessed wrapper can
// reappear without any prop actually changing. No cleanup is returned for
// the same reason those hooks don't return one either — when a table's own
// html changes, dangerouslySetInnerHTML replaces its DOM node wholesale,
// which discards the listeners attached to it along with it; the only
// listeners genuinely at risk of outliving their table (the ones on
// `document`, needed so dragging keeps tracking the cursor even once it
// leaves the table's bounds) are added and removed within a single mouse
// gesture, not left attached across renders.
export function useDragScrollTables(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const wrappers = container.querySelectorAll<HTMLElement>('.table-scroll:not(.drag-scroll-ready)')
    wrappers.forEach((el) => {
      el.classList.add('drag-scroll-ready')

      let isDragging = false
      let dragged = false
      let startX = 0
      let startScrollLeft = 0

      function onMouseMove(e: MouseEvent) {
        const delta = e.pageX - startX
        // Small threshold before committing to "this is a drag, not a
        // click" — below it, a plain click (e.g. on a wikilink inside a
        // cell) should still land normally.
        if (Math.abs(delta) > 4) dragged = true
        el.scrollLeft = startScrollLeft - delta
      }

      function onMouseUp() {
        isDragging = false
        el.classList.remove('table-scroll-dragging')
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      el.addEventListener('mousedown', (e) => {
        // Reused for TableGridEditor's edit-mode grid too (its cells become
        // real <textarea>s while being edited) — a drag starting inside one
        // of those needs to stay normal text-selection/cursor-placement,
        // not get reinterpreted as "pan the table." Read-mode content has
        // no form controls at all, so this is a no-op there.
        if ((e.target as HTMLElement).closest('textarea, input')) return
        // Nothing to drag if the table already fits — don't hijack normal
        // clicks/selection on a table that was never going to scroll.
        if (e.button !== 0 || el.scrollWidth <= el.clientWidth) return
        isDragging = true
        dragged = false
        startX = e.pageX
        startScrollLeft = el.scrollLeft
        el.classList.add('table-scroll-dragging')
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
      })

      // Capture phase so this runs before a wikilink (or anything else)
      // inside the table gets a chance to handle the click — releasing the
      // drag on top of a link shouldn't also navigate away.
      el.addEventListener(
        'click',
        (e) => {
          if (isDragging || dragged) {
            e.preventDefault()
            e.stopPropagation()
          }
        },
        true,
      )
    })
  })
}
