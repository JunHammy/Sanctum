import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { parseTable, serializeTable, type TableData, type ColumnAlign } from '../../lib/table-syntax'
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice'
import { useDragScrollTables } from '../../hooks/useDragScrollTables'

interface TableGridEditorProps {
  id: string
  value: string
  onChange: (id: string, rawText: string) => void
  // Reports whether the table currently needs its own horizontal scroll
  // (i.e. minTableWidth below didn't fit) — Block.tsx uses this to only
  // offer the "expand to fullscreen" button once inline editing has
  // actually gotten cramped, not unconditionally on every table.
  onOverflowChange?: (isOverflowing: boolean) => void
}

// The utility column (Add column / row-delete) gets this fraction of one
// data column's own width — e.g. 0.3 means "30% as wide as a normal
// column." Deliberately NOT a fixed pixel value alongside percentage data
// columns — confirmed real bug from testing: under table-layout:fixed,
// giving N columns `100/N`% each and then a *separate* fixed-px column on
// top sums to MORE than 100% of the table's own width, which pushed the
// whole table (and the page around it, on mobile) into horizontal
// overflow. Deriving everything as a percentage of one shared pool
// guarantees the total is exactly 100%, always, regardless of column
// count — see columnWidthPercent below.
const UTILITY_COLUMN_WEIGHT = 0.3

// One fixed size for every table, regardless of column count — a prior
// version shrank text a step at a time past ~5 columns to buy more room
// before scrolling kicked in, but that traded away readability for
// squeezing in more columns, which isn't the right tradeoff: once a table
// needs more room than it has, it should scroll (see minTableWidth below),
// not become harder to read.
const CELL_TEXT_SIZE_CLASS = 'text-sm'

// The floor a column is allowed to shrink to before the table stops
// squeezing further and starts scrolling instead (see minTableWidth in
// TableGridEditor below) — below this, text stops being legibly readable
// regardless of font size, so there's no point shrinking further; scrolling
// the table itself (never the page around it) is the only real option left,
// same as how every real table/spreadsheet tool (Excel, Notion, GitHub's
// own markdown table rendering) handles a table wider than its viewport.
const MIN_COLUMN_WIDTH_PX = 100

// Click-a-cell-to-edit, adapted from PropertiesPanel.tsx's EditableValue
// pattern rather than sharing code with it — that component is tightly
// coupled to a single-key frontmatter store update, while a table cell
// needs (row, col) addressing into this component's own local state. The
// actual reusable part is small enough (click → input → commit on blur/
// Enter, cancel on Escape) that a shared abstraction for just these two
// call sites would need its own generic callback API no simpler than
// writing it twice — extract later if a third case shows up.
//
// isEditing/onActivate are lifted into TableGridEditor rather than kept as
// local state here — confirmed real bug from testing: a `fillHeight`
// CSS-only attempt (a `height: 100%` span, relying on percentage-height
// resolution inside a table cell) was supposed to make the whole tall
// cell clickable when a *different* cell in the same row had much longer
// content, but percentage heights inside table cells are exactly the kind
// of cross-browser-inconsistent CSS behavior that shouldn't be trusted for
// something this load-bearing — clicking the empty space below a short
// cell's text, but still visually within that tall row, kept hitting the
// bare <td> background and doing nothing. A <td>'s own hit-testable box is
// *always* the full row height by definition of how table layout works,
// with zero CSS required — so the click handler now lives on the <td>
// itself (see TableGridEditor's render below), and this component just
// reflects whatever editing state its parent tells it to.
function TableCell({
  value,
  align,
  isEditing,
  onCommit,
  onCancel,
}: {
  value: string
  align: ColumnAlign
  isEditing: boolean
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const textAlign = align ?? 'left'

  function autoGrowHeight() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Draft is re-seeded from the latest committed value only at the moment
  // editing starts (not kept in sync with `value` on every render) — same
  // "don't fight in-progress typing" reasoning as the rest of this editor.
  useEffect(() => {
    if (isEditing) {
      setDraft(value)
      autoGrowHeight()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-seed on the isEditing transition itself, not on every `value` change (which includes this cell's own in-progress commits)
  }, [isEditing])

  function commit() {
    onCommit(draft)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  if (isEditing) {
    return (
      // A wrapping <textarea>, not a single-line <input> — the table is
      // always fixed-layout (see TableGridEditor below) so no column can
      // grow to fit typed content regardless; long text needs somewhere to
      // go, and that's wrapping within the cell's fixed share of the
      // width, not pushing anything wider. Enter still commits rather than
      // inserting a literal newline — a GFM table row is exactly one line
      // of source text, so the stored value itself never gains a real
      // `\n`, only a visual wrap while being edited.
      <textarea
        ref={textareaRef}
        rows={1}
        autoFocus
        value={draft}
        onChange={(e) => {
          // Confirmed real bug: unlike a keystroke (Enter is caught and
          // blocked below), a paste isn't stopped from putting a literal
          // line break into the value — that corrupts the underlying
          // table markdown enough that it's no longer parseable as a
          // table on the next render, silently dropping back to raw-text
          // mode. Stripped at the source instead.
          setDraft(e.target.value.replace(/\r\n|\r|\n/g, ' '))
          autoGrowHeight()
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={`block w-full min-w-[3ch] resize-none overflow-hidden border-none bg-transparent outline-none ${CELL_TEXT_SIZE_CLASS}`}
        style={{ textAlign, color: 'var(--text-primary)' }}
      />
    )
  }

  // No onClick here, and no click-target sizing games (a prior `fillHeight`
  // h-full attempt lived here) — the enclosing <td onClick={onActivate}>
  // already covers the cell's full clickable area natively, and clicks on
  // this span simply bubble up to it.
  return (
    <span className={`block min-h-[1.4em] w-full break-words ${CELL_TEXT_SIZE_CLASS}`} style={{ textAlign }}>
      {value || ' '}
    </span>
  )
}

// Same props shape as MarkdownEditor (`{ value, onChange }`, plus `id`
// Block.tsx already threads through) so swapping between the two in
// Block.tsx's render branch is a drop-in replacement. Uncontrolled by
// design, same rationale as MarkdownEditor: parsed once on mount, never
// re-synced from props.value afterward — nothing external mutates an
// active block's rawText except this component's own onChange calls, and
// deactivating/reactivating a block already remounts whichever editor is
// active today, so a fresh parse on every mount is sufficient. No new
// store — table-editing state is scoped entirely to this component.
export function TableGridEditor({ id, value, onChange, onOverflowChange }: TableGridEditorProps) {
  const [table, setTable] = useState<TableData>(() => parseTable(value)!)
  const isTouch = useIsTouchDevice()
  const scrollRef = useRef<HTMLDivElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)

  // Same drag-to-pan-anywhere behavior Read mode already has, for the same
  // reason: with enough rows, the scroll wrapper's native scrollbar sits
  // at the very bottom, out of reach until scrolling all the way down —
  // dragging from wherever the cursor already is avoids that trip
  // entirely. useDragScrollTables needs a ref to an *ancestor* of
  // `.table-scroll` (it only searches descendants), hence the separate
  // outerRef instead of reusing scrollRef, which points at the
  // `.table-scroll` element itself.
  useDragScrollTables(outerRef)

  // Which single cell (if any) is currently in edit mode — 'header-N' or
  // 'cell-R-C'. Lifted up here (not local to TableCell) specifically so
  // the <td>/<th> elements below can drive it directly via their own
  // onClick, which is what actually fixes the tall/short-row click-target
  // bug (see TableCell's own comment for the CSS approach this replaced).
  // Starts on the first header — matches the previous autoFocus={col===0}
  // behavior for a freshly-created table.
  const [editingKey, setEditingKey] = useState<string | null>('header-0')

  // Reports overflow as a plain boolean read (scrollWidth > clientWidth)
  // on the already-laid-out DOM — not a measured value fed back into any
  // width/layout decision, which is the specific pattern that caused real
  // bugs earlier in this table editor's history (see minTableWidth's own
  // comment below). Observes both the wrapper (fires on container-width
  // changes — window/sidebar resize) and the <table> itself (fires on
  // content-driven changes — adding/removing a column changes the
  // table's own rendered width without the wrapper's box size changing
  // at all, which a wrapper-only observer would silently miss since
  // ResizeObserver tracks box size, not scrollWidth).
  useEffect(() => {
    const el = scrollRef.current
    const tableEl = el?.querySelector('table')
    if (!el || !tableEl || !onOverflowChange) return
    const observer = new ResizeObserver(() => {
      onOverflowChange(el.scrollWidth > el.clientWidth)
    })
    observer.observe(el)
    observer.observe(tableEl)
    return () => observer.disconnect()
  }, [onOverflowChange, table.headers.length])

  // Confirmed real, legitimate confusion from testing: per-column left/
  // center/right alignment buttons existed here previously, but with short
  // cell content there's often no visible extra space for text to actually
  // shift into, so clicking a button looked like it silently did nothing —
  // genuinely hard to tell if alignment even applied to the cell, the row,
  // or the column (it's always the column, the only scope GFM tables
  // support, but that wasn't legible from the UI). Replaced with a fixed,
  // non-interactive convention instead: headers read as centered, body
  // cells as left-aligned, no button to click either way. The underlying
  // `alignments` data is untouched — a table that already has explicit
  // alignment from elsewhere (hand-written, or a future column added with
  // one) still round-trips losslessly; this only changes what a `null`
  // (never-aligned) column *displays as* while editing, not what gets
  // written to the file.
  function headerAlign(col: number): ColumnAlign {
    return table.alignments[col] ?? 'center'
  }

  // Every mutation re-serializes the whole table and flows up via the same
  // as-you-type onChange contract MarkdownEditor already satisfies —
  // BlockEditor.tsx needs zero changes, autosave/undo ride the existing
  // pipeline for free.
  function commit(next: TableData) {
    setTable(next)
    onChange(id, serializeTable(next))
  }

  function updateHeader(col: number, text: string) {
    commit({ ...table, headers: table.headers.map((h, i) => (i === col ? text : h)) })
  }

  function updateCell(row: number, col: number, text: string) {
    commit({
      ...table,
      rows: table.rows.map((r, ri) => (ri === row ? r.map((c, ci) => (ci === col ? text : c)) : r)),
    })
  }

  function commitHeader(col: number, text: string) {
    updateHeader(col, text)
    setEditingKey(null)
  }

  function commitCell(row: number, col: number, text: string) {
    updateCell(row, col, text)
    setEditingKey(null)
  }

  function addRow() {
    commit({ ...table, rows: [...table.rows, table.headers.map(() => '')] })
  }

  function deleteRow(row: number) {
    if (table.rows.length <= 1) return
    commit({ ...table, rows: table.rows.filter((_, i) => i !== row) })
  }

  function addColumn() {
    commit({
      headers: [...table.headers, 'Column'],
      alignments: [...table.alignments, null],
      rows: table.rows.map((r) => [...r, '']),
    })
  }

  function deleteColumn(col: number) {
    if (table.headers.length <= 1) return
    commit({
      headers: table.headers.filter((_, i) => i !== col),
      alignments: table.alignments.filter((_, i) => i !== col),
      rows: table.rows.map((r) => r.filter((_, i) => i !== col)),
    })
  }

  const revealClass = isTouch ? 'opacity-70' : 'opacity-0'
  // Confirmed real bug from testing, twice over: a runtime-measured,
  // lockable column width (first as a manual drag handle, then as an
  // automatic "lock on first edit" mechanism) sounds reasonable but has no
  // good failure mode — measuring a column's "current" width at the wrong
  // moment (e.g. right as a cell holding one very long unwrapped line
  // first gets clicked into, before it's ever had a chance to wrap) locks
  // in an oversized width that then forces the whole table to overflow
  // horizontally, which is exactly what a table editor must never do,
  // especially on a phone-width screen. Always fixed-layout, always an
  // equal share per column, decided purely from column *count* — never
  // from measuring anything — sidesteps that whole failure class
  // entirely: each column's share is still a fixed percentage of the
  // table's own width, so the table can never internally overflow itself.
  // What *can* happen with enough columns is the table's own width
  // exceeding its container — handled deliberately below (minTableWidth +
  // the scoped overflow-x-auto wrapper), not treated as a bug: once each
  // column's equal share would drop under MIN_COLUMN_WIDTH_PX, the table
  // stops shrinking and the wrapper scrolls instead, the same way GitHub's
  // own markdown table rendering handles a table wider than its column.
  const totalWeight = table.headers.length + UTILITY_COLUMN_WEIGHT
  const columnWidthPercent = 100 / totalWeight
  const utilityColumnPercent = UTILITY_COLUMN_WEIGHT * columnWidthPercent
  // `width: 100%` + `minWidth: <px>` together give "fill the container, but
  // never shrink below this" — CSS min-width always wins over a smaller
  // width. Once the container is too narrow for that minimum, the table
  // becomes wider than its wrapper; the wrapper (not the page) is what
  // scrolls, via overflow-x-auto below. Because column widths are still
  // percentages of the table's own (now-larger-than-container) width, each
  // column resolves to exactly MIN_COLUMN_WIDTH_PX once this is the active
  // constraint — the same math as columnWidthPercent above, just anchored
  // to a pixel floor instead of the container's width.
  const minTableWidth = totalWeight * MIN_COLUMN_WIDTH_PX

  return (
    <div
      ref={outerRef}
      className="rounded-md border p-3 pt-10"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
    >
      {/* Scoped only to the table itself — scrolling here never lets the
          surrounding note page scroll sideways, which was the actual bug
          reported on phone-width screens (that overflow came from the
          columns summing to more than 100%, not from this wrapper; this
          wrapper only ever kicks in now, deliberately, once minTableWidth
          can't fit). table-scroll opts this into useDragScrollTables above
          (click-and-drag panning from anywhere, not just the scrollbar). */}
      <div ref={scrollRef} className="table-scroll cursor-grab overflow-x-auto">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', minWidth: `${minTableWidth}px` }}>
        <colgroup>
          {table.headers.map((_, i) => (
            <col key={i} style={{ width: `${columnWidthPercent}%` }} />
          ))}
          <col style={{ width: `${utilityColumnPercent}%` }} />
        </colgroup>
        <thead>
          <tr>
            {table.headers.map((header, col) => (
              <th
                key={col}
                // onClick lives here, not on the inner TableCell — see
                // TableCell's own comment for why a <th>/<td>'s native hit
                // area (always the full row height) is what makes "click
                // anywhere in the cell" actually reliable.
                onClick={() => setEditingKey(`header-${col}`)}
                className="group/col cursor-text border p-0 align-top"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-start gap-1 px-3 py-2">
                  <div className="min-w-0 flex-1 font-semibold">
                    <TableCell
                      value={header}
                      align={headerAlign(col)}
                      isEditing={editingKey === `header-${col}`}
                      onCommit={(text) => commitHeader(col, text)}
                      onCancel={() => setEditingKey(null)}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete column ${col + 1}`}
                    title="Delete column"
                    disabled={table.headers.length <= 1}
                    // Stops the click from also bubbling to the <th>'s own
                    // onClick above and re-entering edit mode on a header
                    // that's about to be deleted anyway.
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteColumn(col)
                    }}
                    className={`shrink-0 cursor-pointer rounded p-0.5 transition-opacity hover:text-[var(--error)] disabled:cursor-not-allowed disabled:opacity-30 ${revealClass} group-hover/col:opacity-100`}
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </th>
            ))}
            {/* No width class here — the colgroup's utilityColumnPercent
                <col> is authoritative for this column's width under
                table-layout:fixed; a width class on the cell itself would
                just be ignored. */}
            <th className="border-0 p-0 align-middle">
              <button
                type="button"
                aria-label="Add column"
                title="Add column"
                onClick={addColumn}
                className="rounded p-1 hover:opacity-80"
                style={{ color: 'var(--accent-link)' }}
              >
                <Plus size={14} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className="group/row hover:bg-[var(--bg-tertiary)]">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  onClick={() => setEditingKey(`cell-${ri}-${ci}`)}
                  className="cursor-text border px-3 py-2 align-top"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <TableCell
                    value={cell}
                    align={table.alignments[ci]}
                    isEditing={editingKey === `cell-${ri}-${ci}`}
                    onCommit={(text) => commitCell(ri, ci, text)}
                    onCancel={() => setEditingKey(null)}
                  />
                </td>
              ))}
              <td className="border-0 p-0 align-middle">
                <button
                  type="button"
                  aria-label={`Delete row ${ri + 1}`}
                  title="Delete row"
                  disabled={table.rows.length <= 1}
                  onClick={() => deleteRow(ri)}
                  className={`rounded p-1 transition-opacity hover:text-[var(--error)] disabled:cursor-not-allowed disabled:opacity-30 ${revealClass} group-hover/row:opacity-100`}
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <button
        type="button"
        className="mt-2 flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:opacity-80"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        onClick={addRow}
      >
        <Plus size={12} />
        Add row
      </button>
    </div>
  )
}
