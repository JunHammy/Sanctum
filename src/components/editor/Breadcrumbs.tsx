import { useMemo } from 'react'
import { useVaultStore } from '../../stores/vault.store'
import { useUIStore } from '../../stores/ui.store'
import { findPathToNode, findFileName } from '../../lib/vault-tree'

// A file-path trail above a note's content — [] from findPathToNode (a
// root-level note) renders nothing at all, since a note living directly in
// the vault root has no folder segments worth showing. Doesn't depend on
// isReadMode, so (like PropertiesPanel/TableOfContents) it stays mounted
// across the Read/Edit toggle rather than unmounting/remounting.
export function Breadcrumbs({ fileId }: { fileId: string }) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const path = useMemo(() => findPathToNode(fileTree, fileId), [fileTree, fileId])

  if (path.length === 0) return null

  const title = (findFileName(fileTree, fileId) ?? 'Untitled').replace(/\.md$/, '')

  // Reveals just the clicked segment's own ancestor chain (not the deepest
  // folder in the trail) — slicing up to `index` is what makes clicking a
  // shallower segment in a multi-level breadcrumb reveal *that* folder,
  // not always bottom out at the last one.
  function reveal(index: number) {
    const folderIds = path.slice(0, index + 1).map((f) => f.id)
    useUIStore.getState().revealFolders(folderIds)
    useUIStore.getState().openSidebar()
    useUIStore.getState().setPendingRevealId(path[index].id)
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
      {path.map((folder, i) => (
        <span key={folder.id} className="flex items-center gap-1">
          <button type="button" className="hover:underline" onClick={() => reveal(i)} style={{ color: 'var(--text-muted)' }}>
            {folder.name}
          </button>
          <span aria-hidden="true">/</span>
        </span>
      ))}
      <span style={{ color: 'var(--text-secondary)' }}>{title}</span>
    </div>
  )
}
