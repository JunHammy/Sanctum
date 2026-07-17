import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, Folder } from 'lucide-react'
import { fuzzyMatch } from '../../lib/fuzzy-match'
import type { FlatFolder } from '../../lib/vault-tree'

const ROOT_OPTION: FlatFolder = { id: '', name: 'Vault root', path: 'Vault root' }

interface FolderPickerProps {
  folders: FlatFolder[]
  // undefined selects the vault root — mirrors createNote/createFolder's
  // own optional parentId (omitted means root), so the caller can pass
  // this straight through with no translation.
  value: string | undefined
  onChange: (id: string | undefined) => void
}

// Same fuzzy-search-dropdown shape QuickSwitcher/CommandPalette already
// establish (query + selected index + fuzzyMatch + clamped arrow-key nav +
// onMouseEnter/onClick keeping mouse and keyboard selection in sync) — just
// embedded inline inside PromptModal's own form instead of as its own
// top-level Modal, since this picks one field value rather than navigating
// away immediately.
export function FolderPicker({ folders, value, onChange }: FolderPickerProps) {
  const options = useMemo(() => [ROOT_OPTION, ...folders], [folders])
  const selectedOption = options.find((f) => f.id === value) ?? ROOT_OPTION

  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    if (!query.trim()) return options
    return options
      .map((f) => ({ f, score: fuzzyMatch(query, f.path) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.f)
  }, [options, query])

  useEffect(() => setSelected(0), [results])

  // Same anchored-dropdown click-outside convention used throughout this
  // app's other small custom dropdowns (Sidebar's vault switcher, "More
  // vault actions," FileTreeNode's own "⋯" menu).
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  function confirm(option: FlatFolder) {
    onChange(option.id || undefined)
    setQuery('')
    setIsOpen(false)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      // Load-bearing, not defensive filler — this input lives inside
      // PromptModal's own <form>, and an unhandled Enter in any text input
      // there would submit that form (creating the note/folder) instead of
      // just confirming this one field's selection.
      e.preventDefault()
      e.stopPropagation()
      const target = results[selected]
      if (target) confirm(target)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setIsOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <label className="mb-1 block text-xs" style={{ color: 'var(--text-muted)' }}>
        Location
      </label>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm hover:opacity-80"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <Folder size={13} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
          <span className="truncate">{selectedOption.path}</span>
        </span>
        <ChevronDown size={13} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
      </button>
      {isOpen && (
        <div
          className="absolute z-10 mt-1 w-full rounded-md border shadow-lg"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
        >
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter folders…"
            className="w-full border-b px-2.5 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--border)', background: 'transparent', color: 'var(--text-primary)' }}
          />
          <div className="max-h-48 overflow-y-auto p-1">
            {results.length === 0 && (
              <p className="px-2 py-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                No matching folders.
              </p>
            )}
            {results.map((f, i) => (
              <button
                key={f.id || 'root'}
                type="button"
                className="block w-full truncate rounded px-2 py-1.5 text-left text-sm"
                style={{ background: i === selected ? 'var(--bg-tertiary)' : undefined, color: 'var(--text-primary)' }}
                onMouseEnter={() => setSelected(i)}
                onClick={() => confirm(f)}
              >
                {f.path}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
