import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import { useVaultStore } from '../../stores/vault.store'
import type { FileTreeNode as FileTreeNodeType } from '../../types/vault.types'

// The vault-root "assets" folder is a pure attachment dump with nothing to
// navigate to, so it's hidden from the sidebar by name — mirroring the
// ".vault" special-case in vault.store's buildFileTree. The underlying tree
// still has it, since image resolution needs to find attachments there
// regardless. Every other folder shows immediately, even when empty —
// otherwise a freshly created folder has nothing to drag notes into.
const HIDDEN_FOLDER_NAME = 'assets'

const DRAG_MIME = 'application/x-sanctum-note'

interface DragPayload {
  fileId: string
  parentId: string
}

// parentId is the id of the folder (or vault root) this node currently
// lives directly under — needed so a note drag can tell Drive which parent
// to remove as well as which to add (Drive files can technically have
// multiple parents, but Sanctum only ever uses one).
export function FileTreeNode({ node, depth, parentId }: { node: FileTreeNodeType; depth: number; parentId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [isDropTarget, setIsDropTarget] = useState(false)
  const navigate = useNavigate()
  const closeSidebar = useUIStore((s) => s.closeSidebar)
  const moveNote = useVaultStore((s) => s.moveNote)
  const { fileId } = useParams<{ fileId?: string }>()

  if (node.type === 'attachment') return null // not shown in the main tree, MP §5.3

  if (node.type === 'folder') {
    if (node.name === HIDDEN_FOLDER_NAME && depth === 0) return null

    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-1 truncate rounded px-2 py-1 text-left text-sm hover:opacity-80"
          style={{
            paddingLeft: `${depth * 12 + 8}px`,
            color: 'var(--text-primary)',
            background: isDropTarget ? 'var(--bg-tertiary)' : undefined,
          }}
          onClick={() => setExpanded((v) => !v)}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DRAG_MIME)) return
            e.preventDefault()
            setIsDropTarget(true)
          }}
          onDragLeave={() => setIsDropTarget(false)}
          onDrop={(e) => {
            setIsDropTarget(false)
            const raw = e.dataTransfer.getData(DRAG_MIME)
            if (!raw) return
            const payload = JSON.parse(raw) as DragPayload
            if (payload.parentId === node.id) return // already here
            moveNote(payload.fileId, node.id, payload.parentId)
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded &&
          node.children.map((child) => (
            <FileTreeNode key={child.id} node={child} depth={depth + 1} parentId={node.id} />
          ))}
      </div>
    )
  }

  const isActive = node.id === fileId

  return (
    <button
      type="button"
      draggable
      className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:opacity-80"
      style={{
        paddingLeft: `${depth * 12 + 24}px`,
        color: isActive ? 'var(--accent-link)' : 'var(--text-secondary)',
        background: isActive ? 'var(--bg-tertiary)' : undefined,
      }}
      onDragStart={(e) => {
        const payload: DragPayload = { fileId: node.id, parentId }
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => {
        navigate(`/vault/note/${node.id}`)
        // On mobile the sidebar overlays content, so get out of the way
        // once a note's picked; on desktop it stays open (own layout column).
        if (window.innerWidth < 1024) closeSidebar()
      }}
    >
      {node.name.replace(/\.md$/, '')}
    </button>
  )
}
