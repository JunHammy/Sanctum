import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { Plus } from 'lucide-react'
import { splitIntoBlocks, joinBlocks, createEmptyBlock, type Block as BlockType } from '../../lib/blocks/split-blocks'
import { consumePendingScrollAnchor } from '../../lib/scroll-to-line'
import { Block } from './Block'

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
  const commit = useCallback(
    (next: BlockType[]) => {
      setBlocks(next)
      onChange(joinBlocks(next))
    },
    [onChange],
  )

  const handleBlockChange = useCallback(
    (id: string, rawText: string) => {
      setBlocks((prev) => {
        const next = prev.map((b) => (b.id === id ? { ...b, rawText } : b))
        onChange(joinBlocks(next))
        return next
      })
    },
    [onChange],
  )

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
        const next = [...prev.slice(0, index + 1), positioned, ...prev.slice(index + 1)]
        onChange(joinBlocks(next))
        return next
      })
      setActiveId(newBlock.id)
    },
    [onChange],
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
        onChange(joinBlocks(next))
        return next
      })
    },
    [onChange],
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
        const final = next.length > 0 ? next : [createEmptyBlock()]
        onChange(joinBlocks(final))
        return final
      })
      setActiveId((current) => (current === id ? null : current))
    },
    [onChange],
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
        const next = [...withoutDragged.slice(0, insertAt), draggedBlock, ...withoutDragged.slice(insertAt)]
        onChange(joinBlocks(next))
        return next
      })
    },
    [clearDragState, onChange],
  )

  return (
    <div className="flex flex-col" onDragOver={handleContainerDragOver}>
      {blocks.map((block, index) => (
        <div key={block.id} data-block-id={block.id} data-line={block.startLine} className="group">
          <Block
            block={block}
            isActive={activeId === block.id}
            onActivate={setActiveId}
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
        className="mt-2 flex items-center gap-1.5 self-start rounded-md border px-2.5 py-1.5 text-sm hover:opacity-80"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        onClick={() => commit([...blocks, createEmptyBlock()])}
      >
        <Plus size={14} />
        Add block
      </button>
    </div>
  )
}
