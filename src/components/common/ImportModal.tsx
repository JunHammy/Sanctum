import type { ReactNode } from 'react'
import { Modal } from './Modal'

export interface ImportOption {
  key: string
  // Short — the card's icon already carries most of the meaning, and
  // "Import" itself is implied by the modal's own title, so this is just
  // "Word Doc"/"CSV"/etc., not a repeated "Import X (.ext)" sentence.
  label: string
  // Pre-built by the caller (Sidebar.tsx already owns each import's own
  // loading/disabled state) rather than this component trying to
  // reverse-engineer one from a smaller set of props.
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  options: ImportOption[]
}

// A specific 4-over-3 "pyramid" arrangement (row 2's three cards centered
// under row 1's gaps, not left-aligned under the first three) for exactly
// seven options — the current, deliberate set of import formats. An
// 8-column grid (double the visual 4-column resolution) lets row 2's cards
// start at half-a-card offsets (columns 2, 4, 6) relative to row 1's
// (columns 1, 3, 5, 7), each spanning 2 of the 8 columns — that's what
// actually produces the "nestled in the gaps" look rather than a plain
// 4-then-3 left-aligned wrap. Falls back to an ordinary 3-column grid for
// any other option count, rather than a hardcoded arrangement that would
// misalign the moment a format gets added or removed.
const ROW1_COL_START = ['col-start-1', 'col-start-3', 'col-start-5', 'col-start-7']
const ROW2_COL_START = ['col-start-2', 'col-start-4', 'col-start-6']

// A grid of icon+label cards instead of a vertical list of "Import X" rows
// — with seven formats now, every row repeating the word "Import" read as
// noisy, and a card grid is the more familiar pattern for "pick one file
// type" (same idea as a New Page template gallery). Generic on purpose
// (just renders whatever options it's given) — Sidebar.tsx still owns
// every actual import handler/file-input/loading-state, this only owns
// the "pick one" presentation.
export function ImportModal({ isOpen, onClose, options }: ImportModalProps) {
  const usePyramid = options.length === 7

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import">
      <div className={usePyramid ? 'grid grid-cols-8 gap-2' : 'grid grid-cols-3 gap-2'}>
        {options.map((option, i) => (
          <button
            key={option.key}
            type="button"
            className={`flex flex-col items-center gap-1.5 rounded-md border p-3 text-center hover:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-50 ${
              usePyramid ? `col-span-2 ${i < 4 ? ROW1_COL_START[i] : ROW2_COL_START[i - 4]}` : ''
            }`}
            style={{ borderColor: 'var(--border)' }}
            onClick={() => {
              onClose()
              option.onClick()
            }}
            disabled={option.disabled}
          >
            {option.icon}
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
              {option.label}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
