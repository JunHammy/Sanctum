import { useState } from 'react'
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

  return (
    <div className="flex flex-col gap-1">
      {blocks.map((block) => (
        <div key={block.id} className="group relative">
          <Block
            block={block}
            isActive={activeId === block.id}
            onActivate={setActiveId}
            onDeactivate={() => setActiveId(null)}
            onChange={handleBlockChange}
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
