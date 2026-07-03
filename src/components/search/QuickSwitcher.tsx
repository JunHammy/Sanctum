import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../common/Modal'
import { useVaultStore } from '../../stores/vault.store'
import { flattenFiles } from '../../services/search.service'
import { fuzzyMatch } from '../../lib/fuzzy-match'

interface QuickSwitcherProps {
  isOpen: boolean
  onClose: () => void
}

// Deliberately separate from full-text Search (SearchModal): no indexing,
// no network — pure in-memory fuzzy match against the file tree already
// loaded in vault.store, so it opens instantly even before the search
// index has finished building.
export function QuickSwitcher({ isOpen, onClose }: QuickSwitcherProps) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  const files = useMemo(() => flattenFiles(fileTree), [fileTree])

  const results = useMemo(() => {
    if (!query.trim()) return files.slice(0, 20)
    return files
      .map((f) => ({ file: f, score: fuzzyMatch(query, f.name.replace(/\.md$/, '')) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r) => r.file)
  }, [files, query])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelected(0)
    }
  }, [isOpen])

  useEffect(() => {
    setSelected(0)
  }, [query])

  function open(id: string) {
    navigate(`/vault/note/${id}`)
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = results[selected]
      if (target) open(target.id)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Go to note">
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a note title…"
        className="mb-2 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
      />
      <div className="max-h-80 overflow-y-auto">
        {results.length === 0 && (
          <p className="px-1 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            No matching notes.
          </p>
        )}
        {results.map((file, i) => (
          <button
            key={file.id}
            type="button"
            className="block w-full truncate rounded px-2 py-1.5 text-left text-sm"
            style={{
              background: i === selected ? 'var(--bg-tertiary)' : undefined,
              color: 'var(--text-primary)',
            }}
            onMouseEnter={() => setSelected(i)}
            onClick={() => open(file.id)}
          >
            {file.name.replace(/\.md$/, '')}
          </button>
        ))}
      </div>
    </Modal>
  )
}
