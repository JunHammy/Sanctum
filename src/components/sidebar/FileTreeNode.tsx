import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { FileTreeNode as FileTreeNodeType } from '../../types/vault.types'

export function FileTreeNode({ node, depth }: { node: FileTreeNodeType; depth: number }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
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
          <span aria-hidden>{expanded ? '▾' : '▸'}</span>
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
      onClick={() => navigate(`/vault/note/${node.id}`)}
    >
      {node.name.replace(/\.md$/, '')}
    </button>
  )
}
