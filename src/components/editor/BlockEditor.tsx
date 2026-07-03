import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Plus } from 'lucide-react'
import { splitIntoBlocks, joinBlocks, createEmptyBlock, type Block as BlockType } from '../../lib/blocks/split-blocks'
import { Block } from './Block'

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

  function commit(next: BlockType[]) {
    setBlocks(next)
    onChange(joinBlocks(next))
  }

  function handleBlockChange(id: string, rawText: string) {
    commit(blocks.map((b) => (b.id === id ? { ...b, rawText } : b)))
  }

  function handleAddBlock(afterId?: string) {
    const newBlock = createEmptyBlock()
    const index = afterId ? blocks.findIndex((b) => b.id === afterId) : blocks.length - 1
    const next = [...blocks.slice(0, index + 1), newBlock, ...blocks.slice(index + 1)]
    commit(next)
    setActiveId(newBlock.id)
  }

  // Touch-only fallback for reordering — native HTML5 drag (the desktop
  // interaction) never fires on touch devices at all, not just "is hard to
  // use," so this isn't optional polish, it's the only way touch users can
  // reorder blocks.
  function handleMoveBlock(id: string, direction: -1 | 1) {
    const index = blocks.findIndex((b) => b.id === id)
    const targetIndex = index + direction
    if (index === -1 || targetIndex < 0 || targetIndex >= blocks.length) return
    const next = [...blocks]
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
    commit(next)
  }

  function handleDeleteBlock(id: string) {
    const next = blocks.filter((b) => b.id !== id)
    // Always keep at least one block — an empty document is still a
    // clickable-to-type block, not a blank void.
    commit(next.length > 0 ? next : [createEmptyBlock()])
    if (activeId === id) setActiveId(null)
  }

  function clearDragState() {
    setDraggedId(null)
    setDragOverId(null)
    setDropPosition(null)
    if (positionFrameRef.current) cancelAnimationFrame(positionFrameRef.current)
    positionFrameRef.current = null
    if (autoScrollFrameRef.current) cancelAnimationFrame(autoScrollFrameRef.current)
    autoScrollFrameRef.current = null
    edgeEnteredAtRef.current = null
  }

  function handleDragStart(e: DragEvent, id: string) {
    e.dataTransfer.setData(DRAG_MIME, id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedId(id)
  }

  function handleDragOver(e: DragEvent, targetId: string) {
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
      setDragOverId(targetId)
      setDropPosition(position)
    })
  }

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

  function handleDrop(e: DragEvent, targetId: string) {
    e.preventDefault()
    const draggedBlockId = e.dataTransfer.getData(DRAG_MIME)
    const position = dropPosition ?? 'below'
    clearDragState()
    if (!draggedBlockId || draggedBlockId === targetId) return
    reorderBlock(draggedBlockId, targetId, position)
  }

  function reorderBlock(draggedBlockId: string, targetId: string, position: 'above' | 'below') {
    const draggedBlock = blocks.find((b) => b.id === draggedBlockId)
    if (!draggedBlock) return
    const withoutDragged = blocks.filter((b) => b.id !== draggedBlockId)
    const targetIndex = withoutDragged.findIndex((b) => b.id === targetId)
    if (targetIndex === -1) return
    const insertAt = position === 'above' ? targetIndex : targetIndex + 1
    commit([...withoutDragged.slice(0, insertAt), draggedBlock, ...withoutDragged.slice(insertAt)])
  }

  return (
    <div className="flex flex-col" onDragOver={handleContainerDragOver}>
      {blocks.map((block, index) => (
        <div key={block.id} data-block-id={block.id} className="group">
          <Block
            block={block}
            isActive={activeId === block.id}
            onActivate={setActiveId}
            onChange={handleBlockChange}
            onAddBelow={() => handleAddBlock(block.id)}
            onDelete={() => handleDeleteBlock(block.id)}
            onDragStart={(e) => handleDragStart(e, block.id)}
            onDragEnd={clearDragState}
            onDragOver={(e) => handleDragOver(e, block.id)}
            onDrop={(e) => handleDrop(e, block.id)}
            dropIndicator={draggedId && dragOverId === block.id ? dropPosition : null}
            isDragging={draggedId === block.id}
            onMoveUp={() => handleMoveBlock(block.id, -1)}
            onMoveDown={() => handleMoveBlock(block.id, 1)}
            canMoveUp={index > 0}
            canMoveDown={index < blocks.length - 1}
          />
        </div>
      ))}
      <button
        type="button"
        className="mt-2 flex items-center gap-1.5 self-start rounded-md border px-2.5 py-1.5 text-sm hover:opacity-80"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        onClick={() => handleAddBlock()}
      >
        <Plus size={14} />
        Add block
      </button>
    </div>
  )
}
