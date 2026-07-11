import { useEffect, type RefObject } from 'react'

const MIN_COLUMN_WIDTH_PX = 100

// GFM tables render read-only under table-layout:auto (see markdown.css),
// which preserves each column's own natural, content-driven width — a
// deliberate difference from TableGridEditor's edit-mode grid, which
// forces every column to an equal share instead, since a rendered note's
// table should keep whatever proportions its content naturally implies
// rather than being flattened to equal-width like a fresh editable grid.
//
// The tradeoff: table-layout:auto will happily shrink every column far
// below legible width to avoid ever growing past its container, rather
// than growing past it and letting .table-scroll's overflow-x:auto take
// over — confirmed via testing, a wide table just rendered every column
// crushed to a sliver with no scrollbar offered at all, instead of the
// intended "scroll once it doesn't fit" behavior (a per-cell CSS
// min-width was tried first and isn't reliably honored under
// table-layout:auto across browsers — this sets it on the <table> itself
// instead, which is: forcing the table's own box to be at least this
// wide is well-supported, ordinary table sizing behavior, and once that
// floor doesn't fit the container, the table becomes wider than it,
// which is exactly what makes .table-scroll's overflow-x:auto kick in).
//
// :not(.min-width-ready) keeps this idempotent on every render — no
// dependency array, same convention as this codebase's other DOM-walking
// hooks (useDragScrollTables, useTableExpand, useMediaEmbeds, etc.).
export function useTableMinWidth(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.querySelectorAll<HTMLTableElement>('.table-scroll table:not(.min-width-ready)').forEach((table) => {
      table.classList.add('min-width-ready')
      const columnCount = table.querySelector('tr')?.children.length
      if (!columnCount) return
      table.style.minWidth = `${columnCount * MIN_COLUMN_WIDTH_PX}px`
    })
  })
}
