import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../common/Modal'
import { LoadingSpinner } from '../common/LoadingSpinner'
import { useSearchStore } from '../../stores/search.store'
import { useNoteStore } from '../../stores/note.store'
import { readFile } from '../../services/drive.service'
import { findMatchLine } from '../../services/search.service'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
}

// Full-text search over note bodies (not just titles — see QuickSwitcher
// for the instant, title-only equivalent). Backed by search.store's
// MiniSearch index, which is built/kept warm in the background elsewhere
// (vault.store on load, note.store on save) — this component only ever
// reads it.
export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const isIndexing = useSearchStore((s) => s.isIndexing)
  const search = useSearchStore((s) => s.search)
  const setPendingScroll = useNoteStore((s) => s.setPendingScroll)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  const results = useMemo(() => search(query), [search, query])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelected(0)
    }
  }, [isOpen])

  useEffect(() => {
    setSelected(0)
  }, [query])

  async function open(id: string) {
    // Fetched fresh rather than read from the IndexedDB content cache:
    // that cache only gets refreshed on the next full vault-load reindex,
    // not on every save (note.store's incremental reindex updates the
    // *search* index but deliberately doesn't touch this cache) — so a
    // recently-edited note's cached copy can be stale enough to not even
    // contain the text that was just searched for. One fetch on a
    // deliberate click is a fine tradeoff for actually finding the match.
    let line: number | null = null
    try {
      const raw = await readFile(id)
      line = findMatchLine(raw, query)
    } catch {
      // Worst case, the note just opens at the top instead of the match.
    }
    // Paired with the note id, not just the line — this runs before
    // navigate() below, so for a moment the store holds this target while
    // the currently-rendered note is still whatever was open before.
    // MarkdownReader only acts on it once fileId actually matches what's
    // rendered — see the comment on pendingScroll in note.store.ts.
    if (line !== null) setPendingScroll({ fileId: id, line })
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
    <Modal isOpen={isOpen} onClose={onClose} title="Search">
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search note titles, tags, and content…"
        className="mb-2 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
      />
      {isIndexing && (
        <div className="px-1 py-1">
          <LoadingSpinner label="Indexing…" size={14} />
        </div>
      )}
      <div className="max-h-80 overflow-y-auto">
        {!isIndexing && query.trim() && results.length === 0 && (
          <p className="px-1 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            No results.
          </p>
        )}
        {results.map((result, i) => (
          <button
            key={result.id}
            type="button"
            className="block w-full rounded px-2 py-1.5 text-left"
            style={{ background: i === selected ? 'var(--bg-tertiary)' : undefined }}
            onMouseEnter={() => setSelected(i)}
            onClick={() => open(result.id)}
          >
            <div className="truncate text-sm" style={{ color: 'var(--text-primary)' }}>
              {result.title}
            </div>
            {result.excerpt && (
              <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                {result.excerpt}
              </div>
            )}
          </button>
        ))}
      </div>
    </Modal>
  )
}
