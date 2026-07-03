import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, FilePlus, FolderPlus } from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import { useVaultStore } from '../../stores/vault.store'
import { FileTree } from '../sidebar/FileTree'
import { LoadingSpinner } from '../common/LoadingSpinner'
import { PromptModal } from '../common/PromptModal'
import type { FileTreeNode } from '../../types/vault.types'

interface SidebarProps {
  nodes: FileTreeNode[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
}

export function Sidebar({ nodes, isLoading, error, onRefresh }: SidebarProps) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const closeSidebar = useUIStore((s) => s.closeSidebar)
  const createNote = useVaultStore((s) => s.createNote)
  const createFolder = useVaultStore((s) => s.createFolder)
  const navigate = useNavigate()
  const [openModal, setOpenModal] = useState<'note' | 'folder' | null>(null)

  if (!sidebarOpen) return null

  async function handleCreateNote(name: string) {
    setOpenModal(null)
    const fileId = await createNote(name)
    navigate(`/vault/note/${fileId}`)
  }

  async function handleCreateFolder(name: string) {
    setOpenModal(null)
    await createFolder(name)
  }

  return (
    <>
      {/* Backdrop: only needed on mobile, where the sidebar overlays content
          instead of sitting in the normal document flow. */}
      <div className="fixed inset-0 z-30 bg-black/50 sm:hidden" onClick={closeSidebar} aria-hidden="true" />
      <aside
        className="fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto border-r px-2 py-3 sm:static sm:z-auto sm:py-4"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-xs tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
            Vault
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="New note"
              className="rounded p-1 hover:opacity-80"
              style={{ color: 'var(--accent-link)' }}
              onClick={() => setOpenModal('note')}
            >
              <FilePlus size={14} />
            </button>
            <button
              type="button"
              aria-label="New folder"
              className="rounded p-1 hover:opacity-80"
              style={{ color: 'var(--accent-link)' }}
              onClick={() => setOpenModal('folder')}
            >
              <FolderPlus size={14} />
            </button>
            <button
              type="button"
              aria-label="Refresh vault"
              className="rounded p-1 hover:opacity-80 disabled:opacity-50"
              style={{ color: 'var(--accent-link)' }}
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : undefined} />
            </button>
          </div>
        </div>
        {isLoading && (
          <div className="px-2">
            <LoadingSpinner label="Loading vault…" size={16} />
          </div>
        )}
        {error && (
          <p className="px-2 text-sm" style={{ color: 'var(--error)' }}>
            {error}
          </p>
        )}
        {!isLoading && !error && <FileTree nodes={nodes} />}
      </aside>

      <PromptModal
        isOpen={openModal === 'note'}
        title="New note"
        placeholder="Note title"
        onSubmit={handleCreateNote}
        onClose={() => setOpenModal(null)}
      />
      <PromptModal
        isOpen={openModal === 'folder'}
        title="New folder"
        placeholder="Folder name"
        onSubmit={handleCreateFolder}
        onClose={() => setOpenModal(null)}
      />
    </>
  )
}
