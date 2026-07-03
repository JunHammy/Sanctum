import { useRef } from 'react'
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
}

const EMPTY_PLACEHOLDER = '<p class="opacity-40">Click to type…</p>'

// Inactive: renders through the exact same renderBody()/markdown-body path
// MarkdownReader uses for the whole document — wikilinks, callouts, math,
// images, tags all just work here with zero new rendering code, since it's
// the same pipeline, just scoped to one block's text.
// Active: a scoped instance of the Live Preview CodeMirror editor.
export function Block({ block, isActive, onActivate, onDeactivate, onChange }: BlockProps) {
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
    <div
      ref={containerRef}
      className="markdown-body cursor-text rounded px-1 py-0.5 hover:bg-[var(--bg-tertiary)]"
      onClick={() => onActivate(block.id)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
