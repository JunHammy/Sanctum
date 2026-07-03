import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { splitIntoBlocks, joinBlocks, createEmptyBlock, type Block as BlockType } from '../../lib/blocks/split-blocks'
import { Block } from './Block'

interface BlockEditorProps {
  value: string
  onChange: (value: string) => void
}

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

  return (
    <div className="flex flex-col gap-1">
      {blocks.map((block, index) => (
        <div key={block.id} data-block-id={block.id} className="group relative">
          <Block
            block={block}
            isActive={activeId === block.id}
            onActivate={setActiveId}
            onChange={handleBlockChange}
            onMoveUp={() => handleMoveBlock(block.id, -1)}
            onMoveDown={() => handleMoveBlock(block.id, 1)}
            onDelete={() => handleDeleteBlock(block.id)}
            canMoveUp={index > 0}
            canMoveDown={index < blocks.length - 1}
          />
          <button
            type="button"
            aria-label="Add block below"
            className="absolute -bottom-2 left-2 hidden h-4 w-4 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:flex group-hover:opacity-100"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
            onClick={() => handleAddBlock(block.id)}
          >
            <Plus size={10} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="mt-2 flex items-center gap-1.5 self-start rounded px-1.5 py-1 text-xs opacity-60 hover:opacity-100"
        style={{ color: 'var(--text-secondary)' }}
        onClick={() => handleAddBlock()}
      >
        <Plus size={14} />
        Add block
      </button>
    </div>
  )
}
