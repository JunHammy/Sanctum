import { useRef } from 'react'
import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react'
import { useVaultStore } from '../../stores/vault.store'
import { useImageResolution } from '../../hooks/useImageResolution'
import { renderBody } from '../../services/markdown.service'
import { MarkdownEditor } from './MarkdownEditor'
import type { Block as BlockType } from '../../lib/blocks/split-blocks'

interface BlockProps {
  block: BlockType
  isActive: boolean
  onActivate: (id: string) => void
  onDeactivate: () => void
  onChange: (id: string, rawText: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

const EMPTY_PLACEHOLDER = '<p class="opacity-40">Click to type…</p>'

// Inactive: renders through the exact same renderBody()/markdown-body path
// MarkdownReader uses for the whole document — wikilinks, callouts, math,
// images, tags all just work here with zero new rendering code, since it's
// the same pipeline, just scoped to one block's text.
// Active: a scoped instance of the Live Preview CodeMirror editor.
export function Block({
  block,
  isActive,
  onActivate,
  onDeactivate,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  canMoveUp,
  canMoveDown,
}: BlockProps) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const containerRef = useRef<HTMLDivElement>(null)
  const html = block.rawText.trim() ? renderBody(block.rawText) : EMPTY_PLACEHOLDER

  useImageResolution(containerRef, html, fileTree)

  if (isActive) {
    // Any click/click-away commits (already flowed up via onChange as-you-
    // type) and returns to rendered view — no separate "save this block"
    // step needed.
    return (
      <div onBlur={onDeactivate}>
        <MarkdownEditor value={block.rawText} onChange={(text) => onChange(block.id, text)} />
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="markdown-body cursor-text rounded px-1 py-0.5 hover:bg-[var(--bg-tertiary)]"
        onClick={() => onActivate(block.id)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {/* Jupyter-style per-block controls: reorder and delete. Hover-only
          (via the parent's .group class) so they don't clutter reading. */}
      <div
        className="absolute top-0 right-0 hidden items-center gap-0.5 rounded border px-0.5 py-0.5 group-hover:flex"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        <button
          type="button"
          aria-label="Move block up"
          className="rounded p-0.5 disabled:opacity-30"
          style={{ color: 'var(--text-muted)' }}
          disabled={!canMoveUp}
          onClick={(e) => {
            e.stopPropagation()
            onMoveUp()
          }}
        >
          <ChevronUp size={12} />
        </button>
        <button
          type="button"
          aria-label="Move block down"
          className="rounded p-0.5 disabled:opacity-30"
          style={{ color: 'var(--text-muted)' }}
          disabled={!canMoveDown}
          onClick={(e) => {
            e.stopPropagation()
            onMoveDown()
          }}
        >
          <ChevronDown size={12} />
        </button>
        <button
          type="button"
          aria-label="Delete block"
          className="rounded p-0.5 hover:text-[var(--error)]"
          style={{ color: 'var(--text-muted)' }}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
