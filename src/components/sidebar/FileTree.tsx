import { FileTreeNode } from './FileTreeNode'
import type { FileTreeNode as FileTreeNodeType } from '../../types/vault.types'

export function FileTree({ nodes }: { nodes: FileTreeNodeType[] }) {
  if (nodes.length === 0) {
    return (
      <p className="px-2 py-1 text-sm" style={{ color: 'var(--text-muted)' }}>
        No notes yet.
      </p>
    )
  }

  return (
    <div>
      {nodes.map((node) => (
        <FileTreeNode key={node.id} node={node} depth={0} />
      ))}
    </div>
  )
}
