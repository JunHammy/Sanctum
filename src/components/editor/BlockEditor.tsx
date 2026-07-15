import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { splitIntoBlocks, joinBlocks, createEmptyBlock, type Block as BlockType } from '../../lib/blocks/split-blocks'
import { consumePendingScrollAnchor } from '../../lib/scroll-to-line'
import { Block } from './Block'
import { ConfirmModal } from '../common/ConfirmModal'

const EDIT_MODE_SELECTOR = '[data-line]'

interface BlockEditorProps {
  value: string
  onChange: (value: string) => void
}

const DRAG_MIME = 'application/x-sanctum-block'
const AUTOSCROLL_EDGE_PX = 40
const AUTOSCROLL_SPEED_PX = 14
// Native dragover keeps firing repeatedly even while the cursor is
// perfectly still (a lesser-known HTML5 DnD quirk) — without this, simply
// grabbing a block that happened to already sit near the top of the
// current scroll view (common after scrolling into a note) triggered
// auto-scroll on the very first event and never let go, since nothing
// about a stationary cursor would ever move it back out of the edge zone.
// Requiring a deliberate dwell at the edge before scrolling actually starts
// means an incidental starting position doesn't get treated as "scroll now."
const AUTOSCROLL_DWELL_MS = 200

// Uncontrolled by design, same as MarkdownEditor before it: splits `value`
// into blocks once on mount, then owns the blocks array itself. The parent
// forces a fresh instance per note via `key={fileId}` rather than syncing
// external value changes back in.
export function BlockEditor({ value, onChange }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<BlockType[]>(() => {
    const split = splitIntoBlocks(value)
    return split.length > 0 ? split : [createEmptyBlock()]
  })
  const [activeId, setActiveId] = useState<string | null>(null)
  // Multi-block selection — mutually exclusive with activeId, both
  // directions: activating a block clears any selection (handleActivate
  // below), and starting/extending a selection clears activeId
  // (handleSelectClick). selectionAnchor is the index a shift-click range
  // extends from, not necessarily the first block ever clicked — it follows
  // whichever click most recently made the selection non-empty.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null)
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)
  const positionFrameRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const edgeEnteredAtRef = useRef<number | null>(null)
  // Mirrors `dropPosition` state, read by handleDrop instead of the state
  // value itself — otherwise handleDrop would need dropPosition in its
  // dependency array, changing identity on every dragover update (many
  // times per second while dragging) and defeating Block's memoization for
  // every block, not just the one being dragged over.
  const dropPositionRef = useRef<'above' | 'below' | null>(null)

  // Every mutation handler below used to call `onChange(joinBlocks(next))`
  // directly inside its own `setBlocks(prev => ...)` updater. That's a real
  // bug, not just style — React runs an updater function during its render
  // phase (and can replay it more than once), so calling another
  // component's setState from inside one (onChange here ultimately reaches
  // note.store's setState) is exactly the "Cannot update a component while
  // rendering a different component" violation React warns about.
  // Confirmed as the actual cause of a real bug from testing: it surfaced
  // as a python block's editor becoming unresponsive to further typing/
  // Run clicks after the first activate/deactivate cycle, though the same
  // hazard applied to every block type, not just python — any edit could
  // have hit this. Centralizing the notify-parent step into one effect that
  // reacts to `blocks` itself, instead of each handler doing it inline,
  // fixes every call site at once and is what let all five handlers below
  // drop `onChange` from their dependency arrays entirely.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const isFirstBlocksEffect = useRef(true)
  useEffect(() => {
    // Skips the mount: `blocks` is freshly derived from `value` via
    // splitIntoBlocks, so firing onChange here would just round-trip it
    // straight back to the parent unasked — marking a just-opened,
    // untouched note dirty for no reason.
    if (isFirstBlocksEffect.current) {
      isFirstBlocksEffect.current = false
      return
    }
    onChangeRef.current(joinBlocks(blocks))
  }, [blocks])

  // Restores scroll position after switching *into* Edit mode from Read
  // (toggleReadModePreservingScroll in scroll-to-line.ts) — a no-op if
  // there's nothing pending (a plain toggle-into-Edit that isn't the first
  // one, undo/redo remounting this via its key change, etc). This is what
  // replaced the old MutationObserver-based wait for BlockEditor's lazy
  // chunk to finish loading: this effect only runs once React has actually
  // committed this component's blocks (with their real data-line values) to
  // the DOM, so there's no separate "has it loaded yet" check needed at all
  // — Suspense resolving *is* what triggers this mount.
  useLayoutEffect(() => {
    consumePendingScrollAnchor(EDIT_MODE_SELECTOR)
  }, [])

  // In case the note switches (unmounting this instance) mid-drag, e.g. via
  // a keyboard shortcut — an orphaned rAF loop would otherwise keep
  // scrolling the (now different) note's container forever.
  useEffect(() => {
    return () => {
      if (positionFrameRef.current) cancelAnimationFrame(positionFrameRef.current)
      if (autoScrollFrameRef.current) cancelAnimationFrame(autoScrollFrameRef.current)
    }
  }, [])

  // Relying on a wrapping div's onBlur to detect "click outside" only fires
  // when focus actually moves to another *focusable* element — clicking
  // plain page padding/background doesn't shift focus at all, so the block
  // stayed stuck open. A document-level mousedown listener catches any
  // outside click, focusable or not.
  useEffect(() => {
    if (!activeId) return

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest(`[data-block-id="${activeId}"]`)) {
        // Confirmed real bug via testing: a raw document-level mousedown
        // listener can fire and deactivate the block before a still-
        // focused input/textarea inside it (e.g. TableGridEditor's active
        // cell) gets a chance to run its own onBlur — which is what
        // actually commits that cell's pending edit. Losing that race
        // silently discarded the edit entirely (reported as "a table
        // column's content vanishing" after rapidly filling in several
        // cells then clicking away). Forcing a synchronous blur here,
        // *before* deactivating, guarantees the commit happens first
        // regardless of event-ordering luck between two independent
        // listeners — native .blur() calls fire their blur handler
        // synchronously, not on some later tick.
        const focused = document.activeElement as HTMLElement | null
        if (focused && focused.closest(`[data-block-id="${activeId}"]`)) {
          focused.blur()
        }
        setActiveId(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setActiveId(null)
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeId])

  // Same structural pattern as the activeId-gated effect above, but a
  // separate effect rather than merged into it — selection and active-
  // editing are mutually exclusive, so they never need to share a listener.
  // Delete/Backspace opens a confirm rather than deleting immediately:
  // losing several blocks at once via one stray keypress is a meaningfully
  // higher-stakes mistake than the existing single-block delete (a
  // deliberate click on that block's own Trash2 button, no confirm today).
  useEffect(() => {
    if (selectedIds.size === 0) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedIds(new Set())
        setSelectionAnchor(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        setConfirmBulkDeleteOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds])

  // Every handler below is built on the functional setState form (reading
  // the previous blocks from React, not from this closure) specifically so
  // each one can be wrapped in useCallback with an empty/stable dependency
  // list — a genuinely stable function reference for the lifetime of this
  // component. That stability is what lets Block.tsx be wrapped in
  // React.memo and actually skip re-rendering: previously, every one of
  // these was a fresh closure on every render (because it read `blocks`
  // directly), so *every* block re-rendered — and every inactive block
  // re-ran a full markdown parse plus image resolution — on every single
  // keystroke typed into any one of them, which is what was showing up as
  // flicker while editing.
  const handleBlockChange = useCallback((id: string, rawText: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, rawText } : b)))
  }, [])

  // Wraps the raw setActiveId setter so activating a block for editing also
  // clears any existing multi-selection — the two states are mutually
  // exclusive (see selectedIds' own comment above).
  const handleActivate = useCallback((id: string | null) => {
    setActiveId(id)
    setSelectedIds(new Set())
    setSelectionAnchor(null)
  }, [])

  // Shift-click always recomputes a fresh contiguous range from the anchor
  // (not additive to whatever was already selected) — standard file-manager
  // convention. Ctrl/Cmd-click toggles just the one clicked block; the
  // anchor moves to whichever click most recently made the selection
  // non-empty, so a shift-click right after a ctrl-click extends from there.
  const handleSelectClick = useCallback(
    (id: string, index: number, isShift: boolean) => {
      setActiveId(null)
      if (isShift && selectionAnchor !== null) {
        const [start, end] = [selectionAnchor, index].sort((a, b) => a - b)
        setSelectedIds(new Set(blocks.slice(start, end + 1).map((b) => b.id)))
        return
      }
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        if (next.size === 1) setSelectionAnchor(index)
        else if (next.size === 0) setSelectionAnchor(null)
        return next
      })
    },
    [blocks, selectionAnchor],
  )

  const handleBulkDelete = useCallback(() => {
    setBlocks((prev) => {
      const next = prev.filter((b) => !selectedIds.has(b.id))
      // Same "always keep at least one block" invariant handleDeleteBlock
      // enforces below.
      return next.length > 0 ? next : [createEmptyBlock()]
    })
    setSelectedIds(new Set())
    setSelectionAnchor(null)
    setConfirmBulkDeleteOpen(false)
  }, [selectedIds])

  const handleAddBlock = useCallback(
    (afterId?: string) => {
      const newBlock = createEmptyBlock()
      setBlocks((prev) => {
        const index = afterId ? prev.findIndex((b) => b.id === afterId) : prev.length - 1
        // createEmptyBlock() defaults startLine to 0 (correct for the
        // very first block of a brand-new empty note, its only other use)
        // — but a block inserted here, mid-document, isn't actually at
        // line 0. Left uncorrected, scroll-to-line.ts's toggle-preserving
        // logic could pick this block as the "topmost visible" anchor
        // while scrolled somewhere entirely different, and confidently
        // restore to the wrong place (observed directly: a note with a
        // few of these leftover empty blocks would occasionally snap
        // straight to the top on toggle, regardless of actual scroll
        // position). Line numbers shift on every edit anyway once blocks
        // move around, so this is a reasonable estimate, not a precise
        // value — good enough for "roughly this neighborhood," which is
        // all a scroll anchor needs.
        const anchorLine = prev[index]?.startLine ?? 0
        const positioned: BlockType = { ...newBlock, startLine: anchorLine + 0.5 }
        return [...prev.slice(0, index + 1), positioned, ...prev.slice(index + 1)]
      })
      setActiveId(newBlock.id)
      setSelectedIds(new Set())
      setSelectionAnchor(null)
    },
    [],
  )

  // Touch-only fallback for reordering — native HTML5 drag (the desktop
  // interaction) never fires on touch devices at all, not just "is hard to
  // use," so this isn't optional polish, it's the only way touch users can
  // reorder blocks.
  const handleMoveBlock = useCallback(
    (id: string, direction: -1 | 1) => {
      setBlocks((prev) => {
        const index = prev.findIndex((b) => b.id === id)
        const targetIndex = index + direction
        if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev
        const next = [...prev]
        ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
        return next
      })
    },
    [],
  )
  // Distinct stable references (not the same function passed to both) so
  // Block.tsx can tell them apart as separate props, each closed over a
  // fixed direction rather than needing the direction passed at call time.
  const handleMoveUp = useCallback((id: string) => handleMoveBlock(id, -1), [handleMoveBlock])
  const handleMoveDown = useCallback((id: string) => handleMoveBlock(id, 1), [handleMoveBlock])

  const handleDeleteBlock = useCallback(
    (id: string) => {
      setBlocks((prev) => {
        const next = prev.filter((b) => b.id !== id)
        // Always keep at least one block — an empty document is still a
        // clickable-to-type block, not a blank void.
        return next.length > 0 ? next : [createEmptyBlock()]
      })
      setActiveId((current) => (current === id ? null : current))
    },
    [],
  )

  const clearDragState = useCallback(() => {
    setDraggedId(null)
    setDragOverId(null)
    setDropPosition(null)
    dropPositionRef.current = null
    if (positionFrameRef.current) cancelAnimationFrame(positionFrameRef.current)
    positionFrameRef.current = null
    if (autoScrollFrameRef.current) cancelAnimationFrame(autoScrollFrameRef.current)
    autoScrollFrameRef.current = null
    edgeEnteredAtRef.current = null
  }, [])

  const handleDragStart = useCallback((e: DragEvent, id: string) => {
    e.dataTransfer.setData(DRAG_MIME, id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedId(id)
  }, [])

  const handleDragOver = useCallback((e: DragEvent, targetId: string) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()

    // Native dragover fires far more often than a frame boundary (every few
    // ms) — updating React state on every single one is what caused the
    // indicator to visibly flicker/jitter while dragging. Coalescing to at
    // most one state update per animation frame smooths that out.
    if (positionFrameRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clientY = e.clientY
    positionFrameRef.current = requestAnimationFrame(() => {
      positionFrameRef.current = null
      const position = clientY < rect.top + rect.height / 2 ? 'above' : 'below'
      dropPositionRef.current = position
      setDragOverId(targetId)
      setDropPosition(position)
    })
  }, [])

  // Attached to the whole block list (dragover bubbles up from each block's
  // own handler above) so dragging near the top/bottom edge of the visible
  // area scrolls the note automatically — otherwise there's no way to move
  // a block somewhere currently off-screen.
  function handleContainerDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    const scroller = document.querySelector('main')
    if (!scroller) return

    const rect = scroller.getBoundingClientRect()
    const distanceFromTop = e.clientY - rect.top
    const distanceFromBottom = rect.bottom - e.clientY

    let direction = 0
    if (distanceFromTop < AUTOSCROLL_EDGE_PX && scroller.scrollTop > 0) direction = -1
    else if (
      distanceFromBottom < AUTOSCROLL_EDGE_PX &&
      scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1
    )
      direction = 1

    if (direction === 0) {
      edgeEnteredAtRef.current = null
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current)
        autoScrollFrameRef.current = null
      }
      return
    }

    if (edgeEnteredAtRef.current === null) {
      edgeEnteredAtRef.current = performance.now()
    }
    if (performance.now() - edgeEnteredAtRef.current < AUTOSCROLL_DWELL_MS) return

    if (autoScrollFrameRef.current === null) {
      const step = () => {
        scroller.scrollBy(0, direction * AUTOSCROLL_SPEED_PX)
        autoScrollFrameRef.current = requestAnimationFrame(step)
      }
      autoScrollFrameRef.current = requestAnimationFrame(step)
    }
  }

  const handleDrop = useCallback(
    (e: DragEvent, targetId: string) => {
      e.preventDefault()
      const draggedBlockId = e.dataTransfer.getData(DRAG_MIME)
      const position = dropPositionRef.current ?? 'below'
      clearDragState()
      if (!draggedBlockId || draggedBlockId === targetId) return

      setBlocks((prev) => {
        const draggedBlock = prev.find((b) => b.id === draggedBlockId)
        if (!draggedBlock) return prev
        const withoutDragged = prev.filter((b) => b.id !== draggedBlockId)
        const targetIndex = withoutDragged.findIndex((b) => b.id === targetId)
        if (targetIndex === -1) return prev
        const insertAt = position === 'above' ? targetIndex : targetIndex + 1
        return [...withoutDragged.slice(0, insertAt), draggedBlock, ...withoutDragged.slice(insertAt)]
      })
    },
    [clearDragState],
  )

  return (
    <div className="flex flex-col" onDragOver={handleContainerDragOver}>
      {selectedIds.size > 0 && (
        <div
          className="mb-2 flex items-center gap-3 self-start rounded-md border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
        >
          <span>
            {selectedIds.size} block{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          <button
            type="button"
            className="flex items-center gap-1 hover:opacity-80"
            style={{ color: 'var(--error)' }}
            onClick={() => setConfirmBulkDeleteOpen(true)}
          >
            <Trash2 size={14} />
            Delete
          </button>
          <button
            type="button"
            aria-label="Clear selection"
            className="flex items-center hover:opacity-80"
            onClick={() => {
              setSelectedIds(new Set())
              setSelectionAnchor(null)
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {blocks.map((block, index) => (
        <div
          key={block.id}
          data-block-id={block.id}
          data-line={block.startLine}
          className="group"
          onClickCapture={(e) => {
            // Lets CodeMirror's own shift-click text-selection through
            // untouched while this block is the one actively being edited
            // — without this guard, shift-clicking to extend a text
            // selection *inside* an active block would get hijacked into a
            // block-level selection instead.
            if (block.id === activeId) return
            if (!e.shiftKey && !e.ctrlKey && !e.metaKey) return
            e.preventDefault()
            e.stopPropagation()
            handleSelectClick(block.id, index, e.shiftKey)
          }}
        >
          <Block
            block={block}
            isActive={activeId === block.id}
            isSelected={selectedIds.has(block.id)}
            onActivate={handleActivate}
            onChange={handleBlockChange}
            onAddBelow={handleAddBlock}
            onDelete={handleDeleteBlock}
            onDragStart={handleDragStart}
            onDragEnd={clearDragState}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            dropIndicator={draggedId && dragOverId === block.id ? dropPosition : null}
            isDragging={draggedId === block.id}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            canMoveUp={index > 0}
            canMoveDown={index < blocks.length - 1}
          />
        </div>
      ))}
      <button
        type="button"
        // mt-8, not mt-2 — confirmed real feedback from testing: editing
        // the last row of a table (or the last line of any block) felt
        // cramped with this button sitting right up against it, especially
        // since a table's own "Add row" button already lives directly
        // above this one with very little visual separation.
        className="mt-8 flex items-center gap-1.5 self-start rounded-md border px-2.5 py-1.5 text-sm hover:opacity-80"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        // handleAddBlock (same handler each block's own "+" uses) rather
        // than a separate direct setBlocks call — it already activates the
        // new block for editing, which this button was missing entirely
        // (confirmed real gap from testing: had to click into the new
        // block a second time after adding it).
        onClick={() => handleAddBlock()}
      >
        <Plus size={14} />
        Add block
      </button>
      <ConfirmModal
        isOpen={confirmBulkDeleteOpen}
        title="Delete blocks"
        message={`Delete ${selectedIds.size} selected block${selectedIds.size === 1 ? '' : 's'}? This can't be undone directly, though the note's own undo history still covers it.`}
        onConfirm={handleBulkDelete}
        onClose={() => setConfirmBulkDeleteOpen(false)}
      />
    </div>
  )
}
