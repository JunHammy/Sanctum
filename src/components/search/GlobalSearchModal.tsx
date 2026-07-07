import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../common/Modal'
import { LoadingSpinner } from '../common/LoadingSpinner'
import { useVaultStore } from '../../stores/vault.store'
import { useNoteStore } from '../../stores/note.store'
import { useUIStore } from '../../stores/ui.store'
import { readFile } from '../../services/drive.service'
import { findMatchLine, searchAcrossVaults } from '../../services/search.service'
import type { GlobalSearchResultItem } from '../../services/search.service'

interface GlobalSearchModalProps {
  isOpen: boolean
  onClose: () => void
}

// Cross-vault counterpart to SearchModal, used from the vault manager page
// (/vaults) — there's no single active vault there to scope a query to.
// Search itself is async (each vault's cached index is read from IndexedDB
// on demand), unlike SearchModal's synchronous in-memory lookup, so this
// guards against a slower, earlier query's results landing after a faster,
// later one — same "discard stale in-flight result" pattern used to fix the
// vault-switch race elsewhere in this store's sibling logic.
export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const vaults = useVaultStore((s) => s.vaults)
  const switchVault = useVaultStore((s) => s.switchVault)
  const setPendingScroll = useNoteStore((s) => s.setPendingScroll)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults([])
      setSelected(0)
    }
  }, [isOpen])

  useEffect(() => {
    setSelected(0)
    if (!query.trim()) {
      setResults([])
      setIsSearching(false)
      return
    }
    let cancelled = false
    setIsSearching(true)
    searchAcrossVaults(query, vaults)
      .then((r) => {
        if (cancelled) return
        setResults(r)
        setIsSearching(false)
      })
      .catch(() => {
        if (!cancelled) setIsSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [query, vaults])

  async function open(result: GlobalSearchResultItem) {
    onClose()
    try {
      if (useVaultStore.getState().activeVaultId !== result.vaultId) {
        await switchVault(result.vaultId)
      }
      let line: number | null = null
      try {
        const raw = await readFile(result.id)
        line = findMatchLine(raw, query)
      } catch {
        // Worst case, the note just opens at the top instead of the match.
      }
      if (line !== null) setPendingScroll({ fileId: result.id, line })
      // Same reasoning as VaultManagerRoute's handleOpen — landing in a
      // vault via a search result shouldn't leave the sidebar closed if it
      // happened to be closed from an earlier action in this session.
      useUIStore.getState().openSidebar()
      navigate(`/vault/note/${result.id}`)
    } catch {
      // switchVault already surfaces its own error toast on failure.
    }
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
      if (target) open(target)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Search all vaults">
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search across every vault…"
        className="mb-2 w-full rounded-md border px-2.5 py-1.5 text-sm outline-none"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
      />
      {isSearching && (
        <div className="px-1 py-1">
          <LoadingSpinner label="Searching…" size={14} />
        </div>
      )}
      <div className="max-h-96 overflow-y-auto">
        {!isSearching && query.trim() && results.length === 0 && (
          <p className="px-1 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            No results.
          </p>
        )}
        {results.map((result, i) => (
          <button
            key={`${result.vaultId}:${result.id}`}
            type="button"
            className="block w-full rounded px-2 py-1.5 text-left"
            style={{ background: i === selected ? 'var(--bg-tertiary)' : undefined }}
            onMouseEnter={() => setSelected(i)}
            onClick={() => open(result)}
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-sm" style={{ color: 'var(--text-primary)' }}>
                {result.title}
              </span>
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] tracking-wide uppercase"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
              >
                {result.vaultName}
              </span>
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
