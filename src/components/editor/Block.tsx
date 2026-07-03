import { useRef, type DragEvent } from 'react'
import { ChevronUp, ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useVaultStore } from '../../stores/vault.store'
import { useImageResolution } from '../../hooks/useImageResolution'
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice'
import { renderBody } from '../../services/markdown.service'
import { MarkdownEditor } from './MarkdownEditor'
import type { Block as BlockType } from '../../lib/blocks/split-blocks'

interface BlockProps {
  block: BlockType
  isActive: boolean
  onActivate: (id: string) => void
  onChange: (id: string, rawText: string) => void
  onAddBelow: () => void
  onDelete: () => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  dropIndicator: 'above' | 'below' | null
  isDragging: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

const EMPTY_PLACEHOLDER = '<p class="opacity-40">Click to type…</p>'

// Left gutter (drag handle + add-below) stays visible in both active and
// inactive states — reordering or inserting a block shouldn't require
// leaving edit mode first. Delete lives separately, only while inactive
// (viewing) — deliberately not grouped with the frequently-used controls
// so it's not one misclick away from them.
// Inactive content: renders through the exact same renderBody()/
// markdown-body path MarkdownReader uses for the whole document —
// wikilinks, callouts, math, images, tags all just work here with zero new
// rendering code, since it's the same pipeline, just scoped to one block.
// Active content: a scoped instance of the Live Preview CodeMirror editor.
export function Block({
  block,
  isActive,
  onActivate,
  onChange,
  onAddBelow,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  dropIndicator,
  isDragging,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: BlockProps) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const isVaultLoading = useVaultStore((s) => s.isLoading)
  const isTouch = useIsTouchDevice()
  const containerRef = useRef<HTMLDivElement>(null)
  const html = block.rawText.trim() ? renderBody(block.rawText) : EMPTY_PLACEHOLDER

  useImageResolution(containerRef, fileTree, isVaultLoading)

  return (
    <div
      className="flex items-start gap-1 rounded transition-opacity"
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        borderTop: `2px solid ${dropIndicator === 'above' ? 'var(--accent-link)' : 'transparent'}`,
        borderBottom: `2px solid ${dropIndicator === 'below' ? 'var(--accent-link)' : 'transparent'}`,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {/* Touch has no hover state to reveal these on, and native HTML5 drag
          never fires on touch at all — so touch gets always-visible Move
          Up/Down buttons instead of a drag handle, while desktop keeps the
          hover-revealed drag-to-reorder interaction. */}
      <div
        className={`flex shrink-0 flex-col items-center gap-0.5 pt-0.5 transition-opacity select-none ${
          isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {isTouch ? (
          <>
            <button
              type="button"
              aria-label="Move block up"
              disabled={!canMoveUp}
              onClick={onMoveUp}
              className="rounded p-1.5 hover:bg-[var(--bg-tertiary)] disabled:opacity-30"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              aria-label="Move block down"
              disabled={!canMoveDown}
              onClick={onMoveDown}
              className="rounded p-1.5 hover:bg-[var(--bg-tertiary)] disabled:opacity-30"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronDown size={16} />
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label="Drag to reorder"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="cursor-grab rounded p-1 hover:bg-[var(--bg-tertiary)] active:cursor-grabbing"
            style={{ color: 'var(--text-muted)' }}
          >
            <GripVertical size={16} />
          </button>
        )}
        <button
          type="button"
          aria-label="Add block below"
          className="rounded p-1 hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-muted)' }}
          onClick={onAddBelow}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="relative min-w-0 flex-1">
        {isActive ? (
          // Deactivation (click-outside or Escape) is handled centrally in
          // BlockEditor via a document-level listener — see the comment
          // there for why a wrapping onBlur wasn't reliable (only fires on
          // focus moving to another focusable element, not clicks on plain
          // page background). Already flowed up via onChange as-you-type,
          // so no separate "save this block" step is needed on deactivate.
          <MarkdownEditor value={block.rawText} onChange={(text) => onChange(block.id, text)} />
        ) : (
          <>
            <div
              ref={containerRef}
              className="markdown-body cursor-text rounded px-1 py-0.5 hover:bg-[var(--bg-tertiary)]"
              onClick={() => onActivate(block.id)}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <button
              type="button"
              aria-label="Delete block"
              className={`absolute top-0 right-0 rounded p-1 transition-opacity hover:text-[var(--error)] ${
                isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'
              }`}
              style={{ color: 'var(--text-muted)' }}
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
