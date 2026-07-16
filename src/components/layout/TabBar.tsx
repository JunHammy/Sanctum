import { useState, type DragEvent, type MouseEvent } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { X, BookOpen, FileText } from 'lucide-react'
import { useTabsStore, HELP_TAB_ID } from '../../stores/tabs.store'
import { useVaultStore } from '../../stores/vault.store'
import { usePythonKernelStore } from '../../stores/python-kernel.store'
import { findFileName } from '../../lib/vault-tree'
import { tabPath, isPdfTab } from '../../lib/tab-path'

const DRAG_MIME = 'application/x-sanctum-tab'

// Sits above ContentPane (not spanning the sidebar), same placement
// convention as a browser or editor tab strip. Hidden entirely with no
// tabs open — the common "no note selected yet" state shouldn't show an
// empty bar.
export function TabBar() {
  const openFileIds = useTabsStore((s) => s.openFileIds)
  const closeTab = useTabsStore((s) => s.closeTab)
  const moveTab = useTabsStore((s) => s.moveTab)
  const fileTree = useVaultStore((s) => s.fileTree)
  const navigate = useNavigate()
  const { fileId: activeFileId } = useParams<{ fileId?: string }>()
  const { pathname } = useLocation()
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dropSide, setDropSide] = useState<'before' | 'after' | null>(null)

  if (openFileIds.length === 0) return null

  // The Help tab has no :fileId param to match against (it lives at the
  // fixed /help path, not /vault/note/:id) — pathname is what actually
  // tells the two apart.
  function isTabActive(id: string): boolean {
    return id === HELP_TAB_ID ? pathname === '/help' : id === activeFileId
  }

  function handleClose(e: MouseEvent, fileId: string) {
    e.stopPropagation()
    const nextId = closeTab(fileId)
    // Frees that note's Pyodide worker (if it ever started one) — kernels
    // deliberately stay alive across a mere navigate-away/back (switching
    // tabs shouldn't lose Python state), but an actually-closed tab has no
    // reason to keep a multi-MB WASM runtime sitting in memory.
    usePythonKernelStore.getState().closeKernel(fileId)
    // Only redirect if the tab being closed was the one actually open —
    // closing a background tab shouldn't move you away from what you're
    // currently reading.
    if (isTabActive(fileId)) {
      navigate(nextId ? tabPath(nextId, fileTree) : '/vault')
    }
  }

  // Same "which half of the target am I over" technique BlockEditor.tsx
  // uses for reordering blocks, just horizontal (clientX/midpoint width)
  // instead of vertical — an insertion-point line reads more clearly for
  // reordering than highlighting the whole target tab does.
  function handleDragOver(e: DragEvent, id: string) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setDragOverId(id)
    setDropSide(e.clientX < rect.left + rect.width / 2 ? 'before' : 'after')
  }

  function handleDrop(e: DragEvent, id: string) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    setDragOverId(null)
    const draggedId = e.dataTransfer.getData(DRAG_MIME)
    if (draggedId && draggedId !== id && dropSide) moveTab(draggedId, id, dropSide)
  }

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto px-2 py-1.5"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {openFileIds.map((id) => {
        const isActive = isTabActive(id)
        const isHelp = id === HELP_TAB_ID
        const isPdf = !isHelp && isPdfTab(id, fileTree)
        const name = isHelp ? 'Syntax Guide' : (findFileName(fileTree, id) ?? 'Untitled').replace(/\.md$/, '')
        return (
          <div
            key={id}
            role="button"
            tabIndex={0}
            draggable
            aria-current={isActive || undefined}
            onClick={() => navigate(tabPath(id, fileTree))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(tabPath(id, fileTree))
            }}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragLeave={() => setDragOverId((current) => (current === id ? null : current))}
            onDrop={(e) => handleDrop(e, id)}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md py-1.5 pr-1.5 pl-3 text-sm transition-colors"
            style={{
              background: isActive ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.15)' : undefined,
              // A thin insertion-point line on whichever side the dragged
              // tab would land, rather than highlighting the whole target
              // tab — reads more clearly as "it goes here" for reordering.
              borderLeft: `2px solid ${dragOverId === id && dropSide === 'before' ? 'var(--accent-link)' : 'transparent'}`,
              borderRight: `2px solid ${dragOverId === id && dropSide === 'after' ? 'var(--accent-link)' : 'transparent'}`,
            }}
          >
            {isHelp && <BookOpen size={13} className="shrink-0" />}
            {isPdf && <FileText size={13} className="shrink-0" />}
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
