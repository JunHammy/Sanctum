import type { MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { useTabsStore } from '../../stores/tabs.store'
import { useVaultStore } from '../../stores/vault.store'
import { findFileName } from '../../lib/vault-tree'

// Sits above ContentPane (not spanning the sidebar), same placement
// convention as a browser or editor tab strip. Hidden entirely with no
// tabs open — the common "no note selected yet" state shouldn't show an
// empty bar.
export function TabBar() {
  const openFileIds = useTabsStore((s) => s.openFileIds)
  const closeTab = useTabsStore((s) => s.closeTab)
  const fileTree = useVaultStore((s) => s.fileTree)
  const navigate = useNavigate()
  const { fileId: activeFileId } = useParams<{ fileId?: string }>()

  if (openFileIds.length === 0) return null

  function handleClose(e: MouseEvent, fileId: string) {
    e.stopPropagation()
    const nextId = closeTab(fileId)
    // Only redirect if the tab being closed was the one actually open —
    // closing a background tab shouldn't move you away from what you're
    // currently reading.
    if (fileId === activeFileId) {
      navigate(nextId ? `/vault/note/${nextId}` : '/vault')
    }
  }

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto px-2 py-1.5"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {openFileIds.map((id) => {
        const isActive = id === activeFileId
        const name = (findFileName(fileTree, id) ?? 'Untitled').replace(/\.md$/, '')
        return (
          <div
            key={id}
            role="button"
            tabIndex={0}
            aria-current={isActive || undefined}
            onClick={() => navigate(`/vault/note/${id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(`/vault/note/${id}`)
            }}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md py-1.5 pr-1.5 pl-3 text-sm transition-colors"
            style={{
              background: isActive ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.15)' : undefined,
            }}
          >
            <span className="max-w-40 truncate">{name}</span>
            <button
              type="button"
              aria-label={`Close ${name}`}
              className="rounded p-0.5 opacity-60 transition-opacity hover:bg-[var(--border)] hover:opacity-100"
              onClick={(e) => handleClose(e, id)}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
