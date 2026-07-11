import { memo, useEffect, useRef, useState, type DragEvent } from 'react'
import { ChevronUp, ChevronDown, GripVertical, Plus, Trash2, Table2, Code, Maximize2 } from 'lucide-react'
import { useVaultStore } from '../../stores/vault.store'
import { useImageResolution } from '../../hooks/useImageResolution'
import { useTransclusion } from '../../hooks/useTransclusion'
import { useCharts } from '../../hooks/useCharts'
import { useMediaEmbeds } from '../../hooks/useMediaEmbeds'
import { useDragScrollTables } from '../../hooks/useDragScrollTables'
import { useTableMinWidth } from '../../hooks/useTableMinWidth'
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice'
import { renderBody } from '../../services/markdown.service'
import { parseTable } from '../../lib/table-syntax'
import { MarkdownEditor } from './MarkdownEditor'
import { TableGridEditor } from './TableGridEditor'
import { Modal } from '../common/Modal'
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
  useCharts(containerRef)
  useMediaEmbeds(containerRef, fileTree)
  useDragScrollTables(containerRef)
  useTableMinWidth(containerRef)

  // Escape hatch for pasting a table copied from elsewhere (the grid can't
  // sanely accept a multi-line paste) and any hand-edit the grid's toolbar
  // doesn't expose. Reset on deactivate so reactivating a block always
  // re-offers the grid view first, rather than remembering a stale
  // "viewed as raw text" choice from a previous editing session.
  const [forceRawMode, setForceRawMode] = useState(false)
  // Full-viewport view for a table that's outgrown the reading column —
  // reuses the exact same TableGridEditor instance (just mounted inside a
  // Modal instead of inline), so there's no separate "expanded editing"
  // logic to keep in sync with the inline one. Resets alongside
  // forceRawMode on deactivate — editing only ever happens while active.
  const [isExpanded, setIsExpanded] = useState(false)
  // Only true while the inline grid is actually scrolling to fit its
  // columns — see TableGridEditor's onOverflowChange. Gates the expand
  // button so it only appears once inline editing has genuinely gotten
  // cramped, not on every table regardless of size.
  const [isOverflowing, setIsOverflowing] = useState(false)
  useEffect(() => {
    if (!isActive) {
      setForceRawMode(false)
      setIsExpanded(false)
    }
  }, [isActive])

  // Classification is computed fresh from the block's current rawText on
  // every render, not decided once at split time — a block's content can
  // turn into (or out of) a valid table shape purely through in-place
  // typing (e.g. the /table snippet landing inside a previously-empty
  // block), and split-blocks.ts only re-runs on note switch/undo, not on
  // every keystroke. Computed unconditionally (not just while active) —
  // the expand button needs to know a block is a table even before it's
  // clicked into, so it can activate + expand in one step.
  const parsedTable = parseTable(block.rawText)
  const table = forceRawMode ? null : parsedTable

  // Expanding always lands you in the editable grid, even from Read mode —
  // activating first (if needed) and opening expanded are one motion, so
  // there's no separate "read-only big view" to build and keep consistent
  // with the real editing one.
  function expandTable() {
    if (!isActive) onActivate(block.id)
    setIsExpanded(true)
  }

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
          exactly the same space whether the icons are showing or not.
          MarkdownReader.tsx no longer mirrors this gutter in Read mode —
          confirmed via testing that doing so pushed every note's text
          visibly out of alignment with the header above it on every single
          page view, which was a worse problem than the small one-time
          reflow that now happens when toggling into Edit mode. */}
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
          <>
            {table && isExpanded ? (
              <div
                className="rounded-md border p-3 pt-10 text-xs"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}
              >
                Editing in expanded view…
              </div>
            ) : table ? (
              <TableGridEditor
                id={block.id}
                value={block.rawText}
                onChange={onChange}
                onOverflowChange={setIsOverflowing}
              />
            ) : (
              <MarkdownEditor value={block.rawText} onChange={(text) => onChange(block.id, text)} />
            )}
            {parsedTable && (
              <div className="absolute top-2 right-2 flex gap-1.5">
                {table && isOverflowing && (
                  <button
                    type="button"
                    aria-label="Expand table"
                    title="Expand table"
                    className="rounded p-1 hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={expandTable}
                  >
                    <Maximize2 size={14} />
                  </button>
                )}
                {!isExpanded && (
                  <button
                    type="button"
                    aria-label={forceRawMode ? 'Edit as table' : 'Edit as text'}
                    title={forceRawMode ? 'Edit as table' : 'Edit as text'}
                    className="rounded p-1 hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => setForceRawMode((v) => !v)}
                  >
                    {forceRawMode ? <Table2 size={14} /> : <Code size={14} />}
                  </button>
                )}
              </div>
            )}
            {table && isExpanded && (
              <Modal
                isOpen
                onClose={() => setIsExpanded(false)}
                title="Table (Esc or click outside to close)"
                size="large"
                dataBlockId={block.id}
              >
                <TableGridEditor id={block.id} value={block.rawText} onChange={onChange} />
              </Modal>
            )}
          </>
        ) : (
          <>
            <div
              ref={containerRef}
              className="markdown-body cursor-text rounded px-1 py-0.5 hover:bg-[var(--bg-tertiary)]"
              onClick={() => onActivate(block.id)}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            {parsedTable && (
              <button
                type="button"
                aria-label="Expand table"
                title="Expand table"
                className={`absolute top-0 right-7 rounded p-1 transition-opacity hover:bg-[var(--bg-tertiary)] ${
                  isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'
                }`}
                style={{ color: 'var(--text-muted)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  expandTable()
                }}
              >
                <Maximize2 size={14} />
              </button>
            )}
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
