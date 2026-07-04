import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2 } from 'lucide-react'
import { useBacklinksStore } from '../../stores/backlinks.store'
import { useVaultStore } from '../../stores/vault.store'
import { findFileName } from '../../lib/vault-tree'

// Sits below the note content (both Read and Edit mode, same as Obsidian's
// "Linked mentions") — deliberately always mounted rather than toggled, so
// it doesn't need to participate in the toggle-preserving scroll machinery
// in scroll-to-line.ts at all.
export function BacklinksPanel({ fileId }: { fileId: string }) {
  const backlinkIds = useBacklinksStore((s) => s.getBacklinks(fileId))
  const fileTree = useVaultStore((s) => s.fileTree)
  const navigate = useNavigate()

  const items = useMemo(
    () =>
      backlinkIds
        .map((id) => ({ id, name: (findFileName(fileTree, id) ?? 'Untitled').replace(/\.md$/, '') }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [backlinkIds, fileTree],
  )

  if (items.length === 0) return null

  return (
    <div className="mt-10 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
      <h2
        className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase"
        style={{ color: 'var(--text-muted)' }}
      >
        <Link2 size={12} />
        Linked mentions ({items.length})
      </h2>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="text-sm hover:underline"
              style={{ color: 'var(--accent-link)' }}
              onClick={() => navigate(`/vault/note/${item.id}`)}
            >
              {item.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
