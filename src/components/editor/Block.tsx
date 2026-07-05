import { memo, useRef, type DragEvent } from 'react'
import { ChevronUp, ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useVaultStore } from '../../stores/vault.store'
import { useImageResolution } from '../../hooks/useImageResolution'
import { useTransclusion } from '../../hooks/useTransclusion'
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice'
import { renderBody } from '../../services/markdown.service'
import { MarkdownEditor } from './MarkdownEditor'
import type { Block as BlockType } from '../../lib/blocks/split-blocks'

interface BlockProps {
  block: BlockType
  isActive: boolean
  onActivate: (id: string) => void
  onChange: (id: string, rawText: string) => void
  onAddBelow: (id: string) => void
  onDelete: (id: string) => void
  onDragStart: (e: DragEvent, id: string) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent, id: string) => void
  onDrop: (e: DragEvent, id: string) => void
  dropIndicator: 'above' | 'below' | null
  isDragging: boolean
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
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
//
// Wrapped in memo() — every callback prop here is a genuinely stable
// reference from BlockEditor (built on functional setState specifically so
// they never need to change identity), so this only actually re-renders
// when *this* block's own data changes. Without that, typing in any one
// block re-rendered — and re-parsed the markdown, and re-ran image
// resolution, for — every other block on every keystroke.
export const Block = memo(function Block({
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
  useTransclusion(containerRef, fileTree)

  return (
    <div
      className="flex items-start gap-1 rounded transition-opacity"
      onDragOver={(e) => onDragOver(e, block.id)}
      onDrop={(e) => onDrop(e, block.id)}
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
      {/* Fixed width (not sized to its own content) so this column occupies
          exactly the same space whether the icons are showing or not —
          MarkdownReader.tsx reserves an identical-width invisible spacer in
          Read mode, so the actual text content column never shifts width
          or reflows when toggling between the two modes. */}
      <div
        className={`flex w-7 shrink-0 flex-col items-center gap-0.5 pt-0.5 transition-opacity select-none ${
          isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {isTouch ? (
          <>
            <button
              type="button"
              aria-label="Move block up"
              disabled={!canMoveUp}
              onClick={() => onMoveUp(block.id)}
              className="rounded p-1.5 hover:bg-[var(--bg-tertiary)] disabled:opacity-30"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              aria-label="Move block down"
              disabled={!canMoveDown}
              onClick={() => onMoveDown(block.id)}
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
            onDragStart={(e) => onDragStart(e, block.id)}
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
          onClick={() => onAddBelow(block.id)}
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
                onDelete(block.id)
              }}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
})
