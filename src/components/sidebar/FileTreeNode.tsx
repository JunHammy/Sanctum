import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, FileText, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useUIStore } from '../../stores/ui.store'
import { useVaultStore } from '../../stores/vault.store'
import { useTabsStore } from '../../stores/tabs.store'
import { useToastStore } from '../../stores/toast.store'
import { toUserMessage, logError } from '../../lib/error-messages'
import { isDescendantOf, collectFileIds } from '../../lib/vault-tree'
import { DRAG_MIME, type DragPayload, setDraggedPayload, getDraggedPayload } from '../../lib/file-tree-dnd'
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice'
import { ConfirmModal } from '../common/ConfirmModal'
import { PromptModal } from '../common/PromptModal'
import type { FileTreeNode as FileTreeNodeType } from '../../types/vault.types'

// The vault-root "assets" folder is a pure attachment dump with nothing to
// navigate to, so it's hidden from the sidebar by name — mirroring the
// ".vault" special-case in vault.store's buildFileTree. The underlying tree
// still has it, since image resolution needs to find attachments there
// regardless. Every other folder shows immediately, even when empty —
// otherwise a freshly created folder has nothing to drag notes into.
const HIDDEN_FOLDER_NAME = 'assets'

// parentId is the id of the folder (or vault root) this node currently
// lives directly under — needed so a drag can tell Drive which parent to
// remove as well as which to add (Drive files can technically have
// multiple parents, but Sanctum only ever uses one).
export function FileTreeNode({ node, depth, parentId }: { node: FileTreeNodeType; depth: number; parentId: string }) {
  const expanded = useUIStore((s) => s.expandedFolderIds.has(node.id))
  const toggleFolder = useUIStore((s) => s.toggleFolder)
  // 'into' only ever applies to folders (drop onto the middle band to move
  // inside it, existing behavior); 'before'/'after' is the new reorder-
  // among-siblings drop zone, available on both folder and file rows.
  const [dragOverMode, setDragOverMode] = useState<'into' | 'before' | 'after' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const closeSidebar = useUIStore((s) => s.closeSidebar)
  const moveNode = useVaultStore((s) => s.moveNode)
  const renameNode = useVaultStore((s) => s.renameNode)
  const reorderNode = useVaultStore((s) => s.reorderNode)
  const toggleStarred = useVaultStore((s) => s.toggleStarred)
  const deleteNode = useVaultStore((s) => s.deleteNode)
  const fileTree = useVaultStore((s) => s.fileTree)
  const closeTabs = useTabsStore((s) => s.closeTabs)
  const showToast = useToastStore((s) => s.show)
  const isTouch = useIsTouchDevice()
  const { fileId: activeFileId } = useParams<{ fileId?: string }>()

  // Swipe-left-to-reveal-delete, touch only — an alternative to the "⋯"
  // menu's Delete entry, matching the swipe-to-delete convention most
  // mobile note/mail apps already use. Unlike the discrete, end-of-gesture
  // swipes elsewhere (useSwipeGesture.ts), this one needs to visually
  // follow the finger as it drags (that's the whole point of a "reveal"
  // interaction), so it tracks its own live offset here rather than using
  // that shared hook. Only ever reveals Delete, not Star too — a starred
  // file's star is already directly tappable at all times on a touch
  // device (see starButton's own opacity-70 touch fallback below), so
  // duplicating it behind a swipe as well would be redundant.
  const SWIPE_DELETE_WIDTH = 64
  const [swipeX, setSwipeX] = useState(0)
  const [isRowSwiping, setIsRowSwiping] = useState(false)
  const swipeStartRef = useRef<{ x: number; y: number; startSwipeX: number } | null>(null)

  function handleRowTouchStart(e: ReactTouchEvent) {
    if (!isTouch) return
    // Stops this from also bubbling up into Sidebar.tsx's own panel-level
    // swipe-to-close listener — a touch that starts on a row belongs to
    // the row's own swipe handling exclusively, otherwise revealing this
    // row's delete action and closing the whole sidebar could both fire
    // from the same gesture.
    e.stopPropagation()
    const touch = e.touches[0]
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, startSwipeX: swipeX }
  }

  function handleRowTouchMove(e: ReactTouchEvent) {
    const start = swipeStartRef.current
    if (!start) return
    const touch = e.touches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (!isRowSwiping) {
      // Only commits to a horizontal swipe once horizontal clearly
      // dominates — otherwise this fights normal vertical scrolling of
      // the sidebar's own file list.
      if (Math.abs(deltaX) < 10 || Math.abs(deltaY) > Math.abs(deltaX)) return
      setIsRowSwiping(true)
    }
    e.stopPropagation()
    setSwipeX(Math.min(0, Math.max(-SWIPE_DELETE_WIDTH, start.startSwipeX + deltaX)))
  }

  function handleRowTouchEnd(e: ReactTouchEvent) {
    e.stopPropagation()
    swipeStartRef.current = null
    if (!isRowSwiping) return
    setIsRowSwiping(false)
    // Snaps fully open or fully closed based on which half of the reveal
    // width the drag passed — no resting halfway open.
    setSwipeX((current) => (current < -SWIPE_DELETE_WIDTH / 2 ? -SWIPE_DELETE_WIDTH : 0))
  }

  // Same small anchored-dropdown pattern as Sidebar.tsx's own "More vault
  // actions" menu (no shared hook — that one's own comment already notes
  // there's no dropdown primitive to reuse; duplicating this ~10-line
  // effect per-row is cheaper than introducing one for two consumers).
  // Consolidating rename+delete behind one "⋯" is what keeps a starred
  // file's row down to two icons (star, ⋯) instead of three competing for
  // the same small hover-revealed space.
  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  // Every attachment type except PDF stays fully invisible here (MP §5.3) —
  // a PDF gets a real row and opens in its own tab (PdfViewer.tsx), same
  // tab/window model as a note, everything else has no viewer built yet.
  if (node.type === 'attachment' && node.mimeType !== 'application/pdf') return null
  const isPdf = node.type === 'attachment'

  const displayName = node.type === 'file' ? node.name.replace(/\.md$/, '') : node.name

  const swipeDeleteAction = (
    <button
      type="button"
      aria-label={`Delete ${displayName}`}
      className="absolute inset-y-0 right-0 flex items-center justify-center"
      style={{ width: SWIPE_DELETE_WIDTH, background: 'var(--error)', color: 'white' }}
      onClick={() => {
        setSwipeX(0)
        setConfirmOpen(true)
      }}
    >
      <Trash2 size={16} />
    </button>
  )

  async function handleDelete() {
    // If the note being deleted is the one currently open — or, for a
    // folder, the active note lives somewhere in its subtree — navigate
    // to the bare /vault route first. VaultRoute's own effect (added
    // earlier this session, for the exact same "activeNoteId pointing at
    // something that no longer exists" gap) clears note.store for free
    // once it lands there.
    const affectsActiveNote =
      activeFileId != null &&
      (activeFileId === node.id || (node.type === 'folder' && isDescendantOf(fileTree, node.id, activeFileId)))
    try {
      await deleteNode(node.id)
      // Confirmed real bug: deleting a note (or a folder containing open
      // notes) left its tab(s) behind in tabs.store — TabBar's own name
      // lookup then fails against the now-gone fileTree entry and falls
      // back to showing "Untitled" for something that no longer exists at
      // all. Computed from `node` before deletion (collectFileIds walks
      // its own subtree — a folder can close several tabs at once here,
      // not just whichever one happened to be active).
      closeTabs(collectFileIds(node))
      if (affectsActiveNote) navigate('/vault')
      showToast(`Deleted "${displayName}"`, 'success')
    } catch (err) {
      logError('filetree.deleteNode', err)
      showToast(toUserMessage(err, `Could not delete "${displayName}".`), 'error')
    }
  }

  async function handleRename(newName: string) {
    if (newName === displayName) return
    try {
      await renameNode(node.id, newName)
    } catch (err) {
      logError('filetree.renameNode', err)
      showToast(toUserMessage(err, `Could not rename "${displayName}".`), 'error')
    }
  }

  const actionsMenu = (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        aria-label={`More actions for ${displayName}`}
        className={`rounded p-1 transition-opacity hover:opacity-100 ${
          isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{ color: 'var(--text-muted)' }}
        onClick={(e) => {
          e.stopPropagation()
          setMenuOpen((open) => !open)
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="absolute top-full right-0 z-50 mt-1 w-36 rounded-md border p-1 shadow-lg"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-tertiary)]"
              onClick={() => {
                setMenuOpen(false)
                setRenameOpen(true)
              }}
            >
              <Pencil size={13} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-primary)' }}>Rename</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-tertiary)]"
              onClick={() => {
                setMenuOpen(false)
                setConfirmOpen(true)
              }}
            >
              <Trash2 size={13} style={{ color: 'var(--error)' }} />
              <span style={{ color: 'var(--error)' }}>Delete</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <PromptModal
        isOpen={renameOpen}
        title={node.type === 'folder' ? 'Rename folder' : isPdf ? 'Rename PDF' : 'Rename note'}
        placeholder={displayName}
        initialValue={displayName}
        submitLabel="Rename"
        onSubmit={(value) => {
          setRenameOpen(false)
          handleRename(value)
        }}
        onClose={() => setRenameOpen(false)}
      />
      <ConfirmModal
        isOpen={confirmOpen}
        title={node.type === 'folder' ? 'Delete folder' : isPdf ? 'Delete PDF' : 'Delete note'}
        message={
          node.type === 'folder'
            ? `Delete "${displayName}" and everything inside it? This moves it to Google Drive's Trash, where it can be recovered.`
            : `Delete "${displayName}"? This moves it to Google Drive's Trash, where it can be recovered.`
        }
        onConfirm={handleDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  )

  if (node.type === 'folder') {
    if (node.name === HIDDEN_FOLDER_NAME && depth === 0) return null

    return (
      <div>
        <div
          id={`sidebar-node-${node.id}`}
          className="group relative w-full overflow-hidden rounded"
          style={{
            // Same insertion-point-line technique TabBar.tsx uses for its
            // own drag-reorder, vertical instead of horizontal — the middle
            // band ("into", tinted below on the inner sliding layer) still
            // means "drop inside this folder", unchanged from before. Stays
            // on this outer, non-sliding wrapper since it marks a position
            // in the list, not something the swipe-reveal should carry away.
            borderTop: `2px solid ${dragOverMode === 'before' ? 'var(--accent-link)' : 'transparent'}`,
            borderBottom: `2px solid ${dragOverMode === 'after' ? 'var(--accent-link)' : 'transparent'}`,
          }}
          onTouchStart={handleRowTouchStart}
          onTouchMove={handleRowTouchMove}
          onTouchEnd={handleRowTouchEnd}
        >
          {swipeDeleteAction}
          {/* Sliding layer — carries the row's actual content plus an
              opaque background, so it fully hides swipeDeleteAction behind
              it until dragged left far enough to reveal it. */}
          <div
            className="flex w-full items-center gap-1 px-1 hover:opacity-80"
            style={{
              background: dragOverMode === 'into' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
              transform: `translateX(${swipeX}px)`,
              transition: isRowSwiping ? 'none' : 'transform 0.2s',
            }}
          >
            <button
              type="button"
              draggable
              className="flex min-w-0 flex-1 items-center gap-1 truncate py-1 text-left text-sm"
              style={{ paddingLeft: `${depth * 12 + 8}px`, color: 'var(--text-primary)' }}
              onClick={() => toggleFolder(node.id)}
              onDragStart={(e) => {
                const payload: DragPayload = { fileId: node.id, parentId, type: 'folder' }
                setDraggedPayload(payload)
                e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => setDraggedPayload(null)}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_MIME)) return
                e.preventDefault()
                // A file dragged over a folder can only ever be moved *into*
                // it — there's no valid position for a file among sibling
                // folders (folders always sort before files) — so the whole
                // row is the "into" target rather than showing a top/bottom
                // insertion line that would silently do nothing on drop.
                if (getDraggedPayload()?.type === 'note') {
                  setDragOverMode('into')
                  return
                }
                // Top/bottom quarters are reorder-before/after drop zones;
                // the middle half keeps the existing "drop into this folder"
                // behavior.
                const rect = e.currentTarget.getBoundingClientRect()
                const offsetY = e.clientY - rect.top
                if (offsetY < rect.height * 0.25) setDragOverMode('before')
                else if (offsetY > rect.height * 0.75) setDragOverMode('after')
                else setDragOverMode('into')
              }}
              onDragLeave={() => setDragOverMode(null)}
              onDrop={(e) => {
                const mode = dragOverMode
                setDragOverMode(null)
                setDraggedPayload(null)
                const raw = e.dataTransfer.getData(DRAG_MIME)
                if (!raw) return
                const payload = JSON.parse(raw) as DragPayload
                if (payload.fileId === node.id) return // can't drop a folder onto itself

                if (mode === 'before' || mode === 'after') {
                  // reorderNode itself handles both same-parent reorder and
                  // moving to a different parent in one gesture (dropping
                  // next to a sibling in a different folder moves it there,
                  // landing at that position) — same "drag it out among
                  // visible siblings" convention VS Code's own explorer uses.
                  reorderNode(payload.fileId, node.id, mode).catch((err) => {
                    logError('filetree.reorderNode', err)
                    showToast(toUserMessage(err, 'Could not move that item.'), 'error')
                  })
                  return
                }

                if (payload.parentId === node.id) return // already here
                // A folder can't be moved into its own descendant — doing so
                // would build an unreachable branch of the tree (and likely
                // infinite-loop buildFileTree's parent-child reconstruction
                // on the next vault load).
                if (payload.type === 'folder' && isDescendantOf(fileTree, payload.fileId, node.id)) {
                  showToast('Cannot move a folder into its own subfolder', 'error')
                  return
                }
                moveNode(payload.fileId, node.id, payload.parentId)
                  .then(() => showToast(`Moved to "${node.name}"`, 'success'))
                  .catch((err) => {
                    logError('filetree.moveNode', err)
                    showToast(toUserMessage(err, 'Could not move that item.'), 'error')
                  })
              }}
            >
              <motion.span
                className="inline-flex shrink-0"
                animate={{ rotate: expanded ? 90 : 0 }}
                transition={{ duration: 0.15 }}
              >
                <ChevronRight size={14} />
              </motion.span>
              <span className="truncate">{node.name}</span>
            </button>
            {actionsMenu}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ overflow: 'hidden' }}
            >
              {node.children.map((child) => (
                <FileTreeNode key={child.id} node={child} depth={depth + 1} parentId={node.id} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const isActive = node.id === activeFileId

  // Unlike actionsMenu's "⋯" trigger (which only matters once clicked, so
  // pure hover-reveal is correct), a star needs to be visible without
  // hovering — otherwise there's no way to recognize a starred item at a
  // glance. Only shown here (the file-row return), never for folders —
  // starring is a leaf-item concept, same scope as isPdf's own icon.
  const starButton = (
    <button
      type="button"
      aria-label={node.starred ? `Unstar ${displayName}` : `Star ${displayName}`}
      className={`shrink-0 rounded p-1 transition-opacity hover:opacity-100 ${
        node.starred ? '' : isTouch ? 'opacity-70' : 'opacity-0 group-hover:opacity-100'
      }`}
      style={{ color: node.starred ? 'var(--accent-link)' : 'var(--text-muted)' }}
      onClick={(e) => {
        e.stopPropagation()
        toggleStarred(node.id)
      }}
    >
      <Star size={13} fill={node.starred ? 'currentColor' : 'none'} />
    </button>
  )

  return (
    <div
      id={`sidebar-node-${node.id}`}
      className="group relative w-full overflow-hidden rounded"
      style={{
        // A file has no "drop into" behavior of its own — the whole row is
        // just a reorder-before/after target, top/bottom half like TabBar's
        // own left/right split. Stays on this outer, non-sliding wrapper
        // since it marks a position in the list, not something the
        // swipe-reveal should carry away.
        borderTop: `2px solid ${dragOverMode === 'before' ? 'var(--accent-link)' : 'transparent'}`,
        borderBottom: `2px solid ${dragOverMode === 'after' ? 'var(--accent-link)' : 'transparent'}`,
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return
        // A folder can never be reordered among sibling files (folders
        // always sort before files) — don't preventDefault, so the browser
        // shows its native no-drop cursor instead of a misleading
        // insertion line for a drop that would just silently no-op.
        if (getDraggedPayload()?.type === 'folder') return
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        setDragOverMode(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
      }}
      onDragLeave={() => setDragOverMode(null)}
      onDrop={(e) => {
        const mode = dragOverMode
        setDragOverMode(null)
        setDraggedPayload(null)
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return
        const raw = e.dataTransfer.getData(DRAG_MIME)
        if (!raw || mode === 'into' || mode === null) return
        const payload = JSON.parse(raw) as DragPayload
        if (payload.fileId === node.id) return
        // reorderNode itself handles both same-parent reorder and moving
        // to a different parent in one gesture — see its own comment.
        reorderNode(payload.fileId, node.id, mode).catch((err) => {
          logError('filetree.reorderNode', err)
          showToast(toUserMessage(err, 'Could not move that item.'), 'error')
        })
      }}
      onTouchStart={handleRowTouchStart}
      onTouchMove={handleRowTouchMove}
      onTouchEnd={handleRowTouchEnd}
    >
      {swipeDeleteAction}
      {/* Sliding layer — carries the row's actual content plus an opaque
          background, so it fully hides swipeDeleteAction behind it until
          dragged left far enough to reveal it. */}
      <div
        className="flex w-full items-center gap-1 px-1 hover:opacity-80"
        style={{
          // Highlight lives on this sliding layer (not the inner button) so
          // it spans the full width, including behind the star/"⋯" icons —
          // scoping it to the flex-1 button left a visibly short highlight
          // that stopped before reaching them. Always opaque (falls back to
          // the sidebar's own background) rather than `undefined` when not
          // active — this layer needs to fully cover swipeDeleteAction
          // underneath whenever the row isn't swiped open.
          background: isActive ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
          transform: `translateX(${swipeX}px)`,
          transition: isRowSwiping ? 'none' : 'transform 0.2s',
        }}
      >
        <button
          type="button"
          draggable
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-left text-sm"
          style={{
            paddingLeft: `${depth * 12 + 24}px`,
            color: isActive ? 'var(--accent-link)' : 'var(--text-secondary)',
          }}
          onDragStart={(e) => {
            // A dragged PDF behaves exactly like a dragged note for reorder/
            // move-into-folder purposes — same DragPayload shape, no new
            // 'attachment' variant needed.
            const payload: DragPayload = { fileId: node.id, parentId, type: 'note' }
            setDraggedPayload(payload)
            e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => setDraggedPayload(null)}
          onClick={() => {
            navigate(isPdf ? `/vault/pdf/${node.id}` : `/vault/note/${node.id}`)
            // On mobile the sidebar overlays content, so get out of the way
            // once a note's picked; on desktop it stays open (own layout column).
            if (window.innerWidth < 1024) closeSidebar()
          }}
        >
          {isPdf && <FileText size={13} className="shrink-0" />}
          <span className="truncate">{displayName}</span>
        </button>
        {starButton}
        {actionsMenu}
      </div>
    </div>
  )
}
