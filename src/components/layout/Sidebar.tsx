import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  RefreshCw,
  FilePlus,
  FolderPlus,
  FoldVertical,
  UnfoldVertical,
  Archive,
  Upload,
  FileText,
  Table2,
  FileSpreadsheet,
  NotebookText,
  Hash,
  ScrollText,
  MoreHorizontal,
  ChevronDown,
  Check,
  Settings2,
  ClipboardPaste,
} from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import { useVaultStore } from '../../stores/vault.store'
import { useToastStore } from '../../stores/toast.store'
import { useNetworkStore } from '../../stores/network.store'
import { toUserMessage, logError } from '../../lib/error-messages'
import { collectFolderIds } from '../../lib/vault-tree'
import { DRAG_MIME, type DragPayload } from '../../lib/file-tree-dnd'
import { exportVaultZip } from '../../services/backup.service'
import { importDocx } from '../../services/docx-import.service'
import { importCsv } from '../../services/csv-import.service'
import { importXlsx } from '../../services/xlsx-import.service'
import { importIpynb } from '../../services/ipynb-import.service'
import { importMarkdown } from '../../services/markdown-import.service'
import { FileTree } from '../sidebar/FileTree'
import { TagBrowser } from '../sidebar/TagBrowser'
import { LoadingSpinner } from '../common/LoadingSpinner'
import { PromptModal } from '../common/PromptModal'
import { WebClipModal } from '../common/WebClipModal'
import { ImportModal, type ImportOption } from '../common/ImportModal'
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
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)
  const expandedFolderIds = useUIStore((s) => s.expandedFolderIds)
  const expandAll = useUIStore((s) => s.expandAll)
  const collapseAll = useUIStore((s) => s.collapseAll)
  const pendingRevealId = useUIStore((s) => s.pendingRevealId)
  const setPendingRevealId = useUIStore((s) => s.setPendingRevealId)
  const createNote = useVaultStore((s) => s.createNote)
  const createFolder = useVaultStore((s) => s.createFolder)
  const uploadPdf = useVaultStore((s) => s.uploadPdf)
  const moveNode = useVaultStore((s) => s.moveNode)
  const rootFolderId = useVaultStore((s) => s.rootFolderId)
  const vaults = useVaultStore((s) => s.vaults)
  const activeVaultId = useVaultStore((s) => s.activeVaultId)
  const switchVault = useVaultStore((s) => s.switchVault)
  const isOnline = useNetworkStore((s) => s.isOnline)
  const showToast = useToastStore((s) => s.show)
  const toastPromise = useToastStore((s) => s.promise)
  const navigate = useNavigate()
  const [openModal, setOpenModal] = useState<'note' | 'folder' | null>(null)
  const [webClipOpen, setWebClipOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  // Separate from isImporting (docx) rather than shared — a shared flag
  // would show "Importing…" on *both* menu buttons whenever either one is
  // busy, which reads as if the wrong import is running.
  const [isImportingCsv, setIsImportingCsv] = useState(false)
  const [isImportingXlsx, setIsImportingXlsx] = useState(false)
  const [isImportingIpynb, setIsImportingIpynb] = useState(false)
  const [isImportingMarkdown, setIsImportingMarkdown] = useState(false)
  const [isUploadingPdf, setIsUploadingPdf] = useState(false)
  const [isRootDropTarget, setIsRootDropTarget] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const csvImportInputRef = useRef<HTMLInputElement>(null)
  const xlsxImportInputRef = useRef<HTMLInputElement>(null)
  const ipynbImportInputRef = useRef<HTMLInputElement>(null)
  const markdownImportInputRef = useRef<HTMLInputElement>(null)
  const pdfUploadInputRef = useRef<HTMLInputElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const vaultMenuRef = useRef<HTMLDivElement>(null)
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const activeVault = vaults.find((v) => v.id === activeVaultId)
  const otherVaults = vaults.filter((v) => v.id !== activeVaultId)

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

  // Same anchored-dropdown/click-outside convention as the "•••" menu above.
  useEffect(() => {
    if (!vaultMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (vaultMenuRef.current && !vaultMenuRef.current.contains(e.target as Node)) setVaultMenuOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setVaultMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [vaultMenuOpen])

  // Consumes a Breadcrumbs.tsx reveal — by the time this fires, the target
  // folder's own ancestor chain has already been added to expandedFolderIds
  // (revealFolders, called before setPendingRevealId), but that folder's
  // row doesn't exist in the DOM yet until React commits the newly-expanded
  // AnimatePresence branches. A fixed short delay (just past the 0.15s
  // duration every folder already animates open with) is enough here —
  // unlike scroll-to-line.ts's heavier MutationObserver-based settle
  // detector (built for arbitrary async note-content loading), every
  // ancestor here expands in one known, fixed-duration animation, so a
  // timeout is simpler and sufficient rather than over-engineered.
  useEffect(() => {
    if (!pendingRevealId) return
    const id = pendingRevealId
    const timer = setTimeout(() => {
      const el = document.getElementById(`sidebar-node-${id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.classList.add('sidebar-flash')
      setTimeout(() => el?.classList.remove('sidebar-flash'), 2000)
      setPendingRevealId(null)
    }, 200)
    return () => clearTimeout(timer)
  }, [pendingRevealId, setPendingRevealId])

  // VS Code-style drag-to-resize — native mousemove/mouseup rather than
  // HTML5 drag-and-drop (that API is built for dragging *data*, e.g. moving
  // a note into a folder elsewhere in this file, not for a plain "follow
  // the cursor" width drag). Listeners are attached to `document` rather
  // than the handle itself so the drag keeps tracking even if the cursor
  // outruns the thin 4px strip mid-drag.
  useEffect(() => {
    if (!isResizing) return
    function handleMouseMove(e: MouseEvent) {
      const start = resizeStartRef.current
      if (!start) return
      setSidebarWidth(start.startWidth + (e.clientX - start.startX))
    }
    function handleMouseUp() {
      setIsResizing(false)
      resizeStartRef.current = null
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, setSidebarWidth])

  function handleResizeStart(e: ReactMouseEvent) {
    e.preventDefault() // avoid text selection while dragging
    resizeStartRef.current = { startX: e.clientX, startWidth: sidebarWidth }
    setIsResizing(true)
  }

  async function handleSwitchVault(id: string) {
    setVaultMenuOpen(false)
    if (id === activeVaultId) return
    try {
      await switchVault(id)
      // Confirmed bug: switchVault resets note/tab state, but switching via
      // this dropdown never navigated away, so a still-open note's URL
      // (/vault/note/:fileId) stayed put — NoteView just re-opened the same
      // file against the NEW vault's fileTree, and every wikilink/
      // transclusion inside it (pointing at other notes in its OWN vault)
      // showed as not-found. Closing the note view on every switch avoids
      // that entirely, matching what most vault-switcher UIs do anyway.
      navigate('/vault')
    } catch (err) {
      logError('sidebar.switchVault', err)
      showToast(toUserMessage(err, 'Could not switch vaults.'), 'error')
    }
  }

  function handleToggleExpandAll() {
    if (allExpanded) collapseAll()
    else expandAll(allFolderIds)
  }

  function handleImportClick() {
    setMoreMenuOpen(false)
    importInputRef.current?.click()
  }

  function handleImportCsvClick() {
    setMoreMenuOpen(false)
    csvImportInputRef.current?.click()
  }

  function handleImportXlsxClick() {
    setMoreMenuOpen(false)
    xlsxImportInputRef.current?.click()
  }

  function handleImportIpynbClick() {
    setMoreMenuOpen(false)
    ipynbImportInputRef.current?.click()
  }

  function handleImportMarkdownClick() {
    setMoreMenuOpen(false)
    markdownImportInputRef.current?.click()
  }

  function handlePdfUploadClick() {
    setMoreMenuOpen(false)
    pdfUploadInputRef.current?.click()
  }

  function handleRefreshClick() {
    setMoreMenuOpen(false)
    onRefresh()
  }

  // The only drop target previously was a *folder* row — there was no way
  // to drag something back out to the vault root once it was nested
  // anywhere, for either notes or folders. The "Vault" label itself is the
  // drop target for that, same convention as most file managers' "drop on
  // the root label to un-nest" affordance.
  function handleRootDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsRootDropTarget(false)
    if (!rootFolderId) return
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    const payload = JSON.parse(raw) as DragPayload
    if (payload.parentId === rootFolderId) return // already at root
    moveNode(payload.fileId, rootFolderId, payload.parentId)
      .then(() => showToast('Moved to vault root', 'success'))
      .catch((err) => {
        logError('sidebar.moveToRoot', err)
        showToast(toUserMessage(err, 'Could not move that item.'), 'error')
      })
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

  async function handleImportCsvFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const title = file.name.replace(/\.csv$/i, '').trim() || 'Imported CSV'
    setIsImportingCsv(true)
    try {
      await toastPromise(() => importCsv(file), {
        loading: `Importing "${title}"…`,
        success: `Imported "${title}"`,
        error: (err) => toUserMessage(err, `Could not import "${title}".`),
      })
    } catch (err) {
      logError('sidebar.importCsv', err)
    } finally {
      setIsImportingCsv(false)
    }
  }

  async function handleImportXlsxFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const title = file.name.replace(/\.xlsx?$/i, '').trim() || 'Imported spreadsheet'
    setIsImportingXlsx(true)
    try {
      await toastPromise(() => importXlsx(file), {
        loading: `Importing "${title}"…`,
        success: `Imported "${title}"`,
        error: (err) => toUserMessage(err, `Could not import "${title}".`),
      })
    } catch (err) {
      logError('sidebar.importXlsx', err)
    } finally {
      setIsImportingXlsx(false)
    }
  }

  async function handleImportIpynbFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const title = file.name.replace(/\.ipynb$/i, '').trim() || 'Imported notebook'
    setIsImportingIpynb(true)
    try {
      await toastPromise(() => importIpynb(file), {
        loading: `Importing "${title}"…`,
        success: `Imported "${title}"`,
        error: (err) => toUserMessage(err, `Could not import "${title}".`),
      })
    } catch (err) {
      logError('sidebar.importIpynb', err)
    } finally {
      setIsImportingIpynb(false)
    }
  }

  // Unlike ipynb/docx/csv/xlsx, there's no conversion here at all — a .md
  // file already is Sanctum's own note format, this just uploads it as a
  // new note directly. Reduces friction that existed for every *other*
  // supported format having a one-click import except the one format that
  // needs it least to actually get into the vault.
  async function handleImportMarkdownFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const title = file.name.replace(/\.md$/i, '').trim() || 'Imported note'
    setIsImportingMarkdown(true)
    try {
      await toastPromise(() => importMarkdown(file), {
        loading: `Importing "${title}"…`,
        success: `Imported "${title}"`,
        error: (err) => toUserMessage(err, `Could not import "${title}".`),
      })
    } catch (err) {
      logError('sidebar.importMarkdown', err)
    } finally {
      setIsImportingMarkdown(false)
    }
  }

  // Unlike the imports above, this doesn't convert anything — the PDF is
  // uploaded to Drive as-is and shows up as a real, clickable attachment
  // row (FileTreeNode.tsx), opening in its own tab (PdfViewer.tsx).
  async function handlePdfUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setIsUploadingPdf(true)
    try {
      await toastPromise(() => uploadPdf(file), {
        loading: `Uploading "${file.name}"…`,
        success: `Uploaded "${file.name}"`,
        error: (err) => toUserMessage(err, `Could not upload "${file.name}".`),
      })
    } catch (err) {
      logError('sidebar.uploadPdf', err)
    } finally {
      setIsUploadingPdf(false)
    }
  }

  // Built here (not hardcoded inside ImportModal) so that component stays
  // generic — every actual handler/loading-state/icon still lives in this
  // file. Labels are deliberately short ("Word Doc", not "Import Word
  // document (.docx)") — the modal's own title already says "Import," and
  // a grid card reads its icon + a short word, not a full sentence. The
  // modal closes the instant a card is clicked (toastPromise inside each
  // handler is what actually shows loading feedback), so `disabled` here
  // is really just "don't let a re-open double-trigger the same import
  // while it's still running," not something the user sits and watches.
  const importOptions: ImportOption[] = [
    {
      key: 'docx',
      label: 'Word Doc',
      icon: <FileText size={22} style={{ color: 'var(--text-muted)' }} />,
      onClick: handleImportClick,
      disabled: isImporting || !isOnline,
    },
    {
      key: 'csv',
      label: 'CSV',
      // Table2, not FileSpreadsheet — a bare grid glyph reads as "rows and
      // columns of plain data," distinct from Excel's own file-branded icon
      // right next to it, rather than the two formats sharing one icon.
      icon: <Table2 size={22} style={{ color: 'var(--text-muted)' }} />,
      onClick: handleImportCsvClick,
      disabled: isImportingCsv || !isOnline,
    },
    {
      key: 'xlsx',
      label: 'Excel',
      icon: <FileSpreadsheet size={22} style={{ color: 'var(--text-muted)' }} />,
      onClick: handleImportXlsxClick,
      disabled: isImportingXlsx || !isOnline,
    },
    {
      key: 'ipynb',
      label: 'Jupyter',
      icon: <NotebookText size={22} style={{ color: 'var(--text-muted)' }} />,
      onClick: handleImportIpynbClick,
      disabled: isImportingIpynb || !isOnline,
    },
    {
      key: 'markdown',
      label: 'Markdown',
      // Hash — markdown's own most recognizable syntax (# headings).
      icon: <Hash size={22} style={{ color: 'var(--text-muted)' }} />,
      onClick: handleImportMarkdownClick,
      disabled: isImportingMarkdown || !isOnline,
    },
    {
      key: 'pdf',
      label: 'PDF',
      icon: <ScrollText size={22} style={{ color: 'var(--text-muted)' }} />,
      onClick: handlePdfUploadClick,
      disabled: isUploadingPdf || !isOnline,
    },
    {
      key: 'web',
      label: 'Web Clip',
      icon: <ClipboardPaste size={22} style={{ color: 'var(--text-muted)' }} />,
      onClick: () => setWebClipOpen(true),
      disabled: !isOnline,
    },
  ]

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
              className="fixed inset-y-0 left-0 z-40 border-r lg:relative lg:z-auto"
              style={{ width: sidebarWidth, borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
              initial={{ x: -sidebarWidth, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -sidebarWidth, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {/* Drag-to-resize handle, desktop only. Lives directly on this
                  non-scrolling outer panel, NOT inside the scrollable content
                  div below — confirmed as the actual reason dragging didn't
                  work at all: both this handle and the sidebar's own vertical
                  scrollbar were occupying the same pixels at the right edge,
                  and the browser's native scrollbar always wins that mouse
                  event. The inner div now stops 6px short of this edge so
                  its scrollbar renders there instead, leaving this strip
                  genuinely free. hover highlight added for cursor feedback
                  beyond just the cursor:col-resize style. */}
              {/* No visible highlight at all, hover or active-drag — the
                  cursor:col-resize change alone is the feedback. */}
              <div
                className="absolute inset-y-0 right-0 z-10 hidden w-2 cursor-col-resize lg:block"
                onMouseDown={handleResizeStart}
              />
              <div className="h-full w-[calc(100%-6px)] overflow-y-auto px-2 py-3 lg:py-4">
              <div
                className="mb-2 flex items-center justify-between gap-1 rounded px-2"
                style={{ background: isRootDropTarget ? 'var(--bg-tertiary)' : undefined }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_MIME)) return
                  e.preventDefault()
                  setIsRootDropTarget(true)
                }}
                onDragLeave={() => setIsRootDropTarget(false)}
                onDrop={handleRootDrop}
              >
                <div className="relative min-w-0 flex-1" ref={vaultMenuRef}>
                  <button
                    type="button"
                    title="Drop a note or folder here to move it to the vault root — click to switch vaults"
                    className="flex w-full min-w-0 items-center gap-1 rounded text-xs tracking-wide uppercase hover:opacity-80"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => setVaultMenuOpen((open) => !open)}
                  >
                    <span className="truncate">{activeVault?.name ?? 'Vault'}</span>
                    <ChevronDown size={12} className="shrink-0" />
                  </button>
                  <AnimatePresence>
                    {vaultMenuOpen && (
                      <motion.div
                        className="absolute top-full left-0 z-50 mt-1 w-56 rounded-md border p-1 shadow-lg"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                      >
                        {activeVault && (
                          <div className="flex items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm">
                            <Check size={16} style={{ color: 'var(--accent-link)' }} />
                            <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                              {activeVault.name}
                            </span>
                          </div>
                        )}
                        {otherVaults.map((vault) => (
                          <button
                            key={vault.id}
                            type="button"
                            className="flex w-full items-center gap-2.5 rounded py-2 pr-2.5 pl-[34px] text-left text-sm hover:bg-[var(--bg-tertiary)]"
                            style={{ color: 'var(--text-primary)' }}
                            onClick={() => handleSwitchVault(vault.id)}
                          >
                            <span className="truncate">{vault.name}</span>
                          </button>
                        ))}
                        <div className="my-1 h-px" style={{ background: 'var(--border)' }} aria-hidden="true" />
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)]"
                          onClick={() => {
                            setVaultMenuOpen(false)
                            navigate('/vaults')
                          }}
                        >
                          <Settings2 size={16} style={{ color: 'var(--text-muted)' }} />
                          <span style={{ color: 'var(--text-primary)' }}>Manage vaults…</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="New note"
                    title={isOnline ? undefined : 'Disabled while offline'}
                    className="rounded p-1 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:opacity-30"
                    style={{ color: 'var(--accent-link)' }}
                    onClick={() => setOpenModal('note')}
                    disabled={!isOnline}
                  >
                    <FilePlus size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="New folder"
                    title={isOnline ? undefined : 'Disabled while offline'}
                    className="rounded p-1 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:opacity-30"
                    style={{ color: 'var(--accent-link)' }}
                    onClick={() => setOpenModal('folder')}
                    disabled={!isOnline}
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
                          {/* Everything that brings content INTO the vault
                              now lives behind one "Import…" entry point
                              (ImportModal) instead of six separate rows
                              here — that many side-by-side options read as
                              a long, undifferentiated list once docx/CSV/
                              Excel/Jupyter/Markdown/PDF/web-clip all
                              accumulated. Still visually separated from the
                              two vault-level utility actions above. */}
                          <div className="my-1 h-px" style={{ background: 'var(--border)' }} aria-hidden="true" />
                          <button
                            type="button"
                            className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)]"
                            onClick={() => {
                              setMoreMenuOpen(false)
                              setImportModalOpen(true)
                            }}
                          >
                            <Upload size={16} style={{ color: 'var(--text-muted)' }} />
                            <span style={{ color: 'var(--text-primary)' }}>Import…</span>
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
                  <input
                    ref={csvImportInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleImportCsvFile}
                  />
                  <input
                    ref={xlsxImportInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleImportXlsxFile}
                  />
                  <input
                    ref={ipynbImportInputRef}
                    type="file"
                    accept=".ipynb"
                    className="hidden"
                    onChange={handleImportIpynbFile}
                  />
                  <input
                    ref={markdownImportInputRef}
                    type="file"
                    accept=".md"
                    className="hidden"
                    onChange={handleImportMarkdownFile}
                  />
                  <input
                    ref={pdfUploadInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handlePdfUploadFile}
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
              </div>
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
      <WebClipModal isOpen={webClipOpen} onClose={() => setWebClipOpen(false)} />
      <ImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} options={importOptions} />
    </>
  )
}
