import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import type { FileTreeNode as FileTreeNodeType } from '../../types/vault.types'

export function FileTreeNode({ node, depth }: { node: FileTreeNodeType; depth: number }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const closeSidebar = useUIStore((s) => s.closeSidebar)
  const { fileId } = useParams<{ fileId?: string }>()

  if (node.type === 'attachment') return null // not shown in the main tree, MP §5.3

  if (node.type === 'folder') {
    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-1 truncate rounded px-2 py-1 text-left text-sm hover:opacity-80"
          style={{ paddingLeft: `${depth * 12 + 8}px`, color: 'var(--text-primary)' }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded &&
          node.children.map((child) => <FileTreeNode key={child.id} node={child} depth={depth + 1} />)}
      </div>
    )
  }

  const isActive = node.id === fileId

  return (
    <button
      type="button"
      className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:opacity-80"
      style={{
        paddingLeft: `${depth * 12 + 24}px`,
        color: isActive ? 'var(--accent-link)' : 'var(--text-secondary)',
        background: isActive ? 'var(--bg-tertiary)' : undefined,
      }}
      onClick={() => {
        navigate(`/vault/note/${node.id}`)
        // On mobile the sidebar overlays content, so get out of the way
        // once a note's picked; on desktop it stays open (own layout column).
        if (window.innerWidth < 640) closeSidebar()
      }}
    >
      {node.name.replace(/\.md$/, '')}
    </button>
  )
}
