import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  RefreshCw,
  FilePlus,
  FolderPlus,
  FoldVertical,
  UnfoldVertical,
  Archive,
  Upload,
  MoreHorizontal,
} from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import { useVaultStore } from '../../stores/vault.store'
import { useToastStore } from '../../stores/toast.store'
import { toUserMessage, logError } from '../../lib/error-messages'
import { collectFolderIds } from '../../lib/vault-tree'
import { exportVaultZip } from '../../services/backup.service'
import { importDocx } from '../../services/docx-import.service'
import { FileTree } from '../sidebar/FileTree'
import { TagBrowser } from '../sidebar/TagBrowser'
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
  const expandedFolderIds = useUIStore((s) => s.expandedFolderIds)
  const expandAll = useUIStore((s) => s.expandAll)
  const collapseAll = useUIStore((s) => s.collapseAll)
  const createNote = useVaultStore((s) => s.createNote)
  const createFolder = useVaultStore((s) => s.createFolder)
  const showToast = useToastStore((s) => s.show)
  const toastPromise = useToastStore((s) => s.promise)
  const [openModal, setOpenModal] = useState<'note' | 'folder' | null>(null)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)

  const allFolderIds = useMemo(() => collectFolderIds(nodes), [nodes])
  // A single toggle (rather than two separate buttons) that flips based on
  // current state — same "smart toggle" pattern as an editor's collapse/
  // expand-all-folds. Once every folder is expanded, clicking again folds
  // them back up instead of being a no-op.
  const allExpanded = allFolderIds.length > 0 && allFolderIds.every((id) => expandedFolderIds.has(id))

  // Anchored dropdown, not a centered Modal — a "more actions" menu reads
  // better tucked right under the button that opened it than as a whole-
  // screen overlay for what's just 3 short rows. No existing dropdown
  // component to reuse (every other menu in this app is Modal-based), so
  // this is a small one-off: click-outside/Escape handled directly here
  // rather than introducing a new shared hook for a single consumer.
  useEffect(() => {
    if (!moreMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [moreMenuOpen])

  function handleToggleExpandAll() {
    if (allExpanded) collapseAll()
    else expandAll(allFolderIds)
  }

  function handleImportClick() {
    setMoreMenuOpen(false)
    importInputRef.current?.click()
  }

  function handleRefreshClick() {
    setMoreMenuOpen(false)
    onRefresh()
  }

  async function handleCreateNote(name: string) {
    setOpenModal(null)
    try {
      await createNote(name)
      showToast(`Created "${name}"`, 'success')
    } catch (err) {
      logError('sidebar.createNote', err)
      showToast(toUserMessage(err, 'Could not create the note.'), 'error')
    }
  }

  async function handleCreateFolder(name: string) {
    setOpenModal(null)
    try {
      await createFolder(name)
      showToast(`Created folder "${name}"`, 'success')
    } catch (err) {
      logError('sidebar.createFolder', err)
      showToast(toUserMessage(err, 'Could not create the folder.'), 'error')
    }
  }

  async function handleBackup() {
    setMoreMenuOpen(false)
    setIsBackingUp(true)
    try {
      await toastPromise(() => exportVaultZip(nodes), {
        loading: 'Zipping vault…',
        success: 'Vault backup downloaded',
        error: (err) => toUserMessage(err, 'Could not create the vault backup.'),
      })
    } catch (err) {
      // toastPromise already surfaced the error toast — this just keeps
      // the diagnostic log.
      logError('sidebar.backup', err)
    } finally {
      setIsBackingUp(false)
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset immediately, not after the import finishes — otherwise
    // re-selecting the *same* file a second time (e.g. retrying after a
    // failure) wouldn't fire onChange at all, since the input's value
    // never actually changed.
    e.target.value = ''
    if (!file) return

    const title = file.name.replace(/\.docx$/i, '').trim() || 'Imported document'
    setIsImporting(true)
    try {
      await toastPromise(() => importDocx(file), {
        loading: `Importing "${title}"…`,
        success: `Imported "${title}"`,
        error: (err) => toUserMessage(err, `Could not import "${title}".`),
      })
    } catch (err) {
      logError('sidebar.importDocx', err)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <>
      {/* AnimatePresence lets these actually animate *out* on close instead
          of vanishing instantly (the old `if (!sidebarOpen) return null`).
          Most noticeable on mobile, where this overlays content rather than
          sitting in normal flow. */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Backdrop: only needed on mobile, where the sidebar overlays
                content instead of sitting in the normal document flow. */}
            <motion.div
              className="fixed inset-0 z-30 bg-black/50 lg:hidden"
              onClick={closeSidebar}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto border-r px-2 py-3 lg:static lg:z-auto lg:py-4"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
              initial={{ x: -256, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -256, opacity: 0 }}
              transition={{ duration: 0.18 }}
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
                    aria-label={allExpanded ? 'Collapse all folders' : 'Expand all folders'}
                    title={allExpanded ? 'Collapse all folders' : 'Expand all folders'}
                    className="rounded p-1 hover:opacity-80 disabled:opacity-30"
                    style={{ color: 'var(--accent-link)' }}
                    onClick={handleToggleExpandAll}
                    disabled={allFolderIds.length === 0}
                  >
                    {allExpanded ? <FoldVertical size={14} /> : <UnfoldVertical size={14} />}
                  </button>
                  {/* Less-frequent actions (refresh, backup, import) live
                      behind this instead of each getting a permanent icon —
                      six icons in a row read as cluttered for actions that
                      aren't reached for nearly as often as New note/New
                      folder/Expand-collapse. */}
                  <div className="relative" ref={moreMenuRef}>
                    <button
                      type="button"
                      aria-label="More vault actions"
                      title="More vault actions"
                      className="rounded p-1 hover:opacity-80"
                      style={{ color: 'var(--accent-link)' }}
                      onClick={() => setMoreMenuOpen((open) => !open)}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    <AnimatePresence>
                      {moreMenuOpen && (
                        <motion.div
                          className="absolute top-full right-0 z-50 mt-1 w-56 rounded-md border p-1 shadow-lg"
                          style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                          initial={{ opacity: 0, y: -4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                        >
                          <button
                            type="button"
                            className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
                            onClick={handleRefreshClick}
                            disabled={isLoading}
                          >
                            <RefreshCw
                              size={16}
                              style={{ color: 'var(--text-muted)' }}
                              className={isLoading ? 'animate-spin' : undefined}
                            />
                            <span style={{ color: 'var(--text-primary)' }}>Refresh vault</span>
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
                            onClick={handleBackup}
                            disabled={isBackingUp || nodes.length === 0}
                          >
                            <Archive
                              size={16}
                              style={{ color: 'var(--text-muted)' }}
                              className={isBackingUp ? 'animate-pulse' : undefined}
                            />
                            <span style={{ color: 'var(--text-primary)' }}>
                              {isBackingUp ? 'Zipping…' : 'Download vault backup (.zip)'}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
                            onClick={handleImportClick}
                            disabled={isImporting}
                          >
                            <Upload
                              size={16}
                              style={{ color: 'var(--text-muted)' }}
                              className={isImporting ? 'animate-pulse' : undefined}
                            />
                            <span style={{ color: 'var(--text-primary)' }}>
                              {isImporting ? 'Importing…' : 'Import Word document (.docx)'}
                            </span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={handleImportFile}
                  />
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
              {!isLoading && !error && (
                <>
                  <FileTree nodes={nodes} />
                  <TagBrowser />
                </>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

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
