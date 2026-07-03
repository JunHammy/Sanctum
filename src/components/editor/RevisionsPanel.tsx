import { useEffect, useState } from 'react'
import { Modal } from '../common/Modal'
import { LoadingSpinner } from '../common/LoadingSpinner'
import { listRevisions, readRevision, updateFile } from '../../services/drive.service'
import { useNoteStore } from '../../stores/note.store'
import { useToastStore } from '../../stores/toast.store'
import type { DriveRevision } from '../../lib/drive-api'

interface RevisionsPanelProps {
  fileId: string
  isOpen: boolean
  onClose: () => void
}

// Drive already keeps a revision on every save (each updateFile PATCH),
// for free — this reads that history back rather than reinventing it, and
// replaces the earlier "open in Drive and hope version history is there"
// approach, which turned out to not reliably expose it for non-Docs files.
export function RevisionsPanel({ fileId, isOpen, onClose }: RevisionsPanelProps) {
  const openNote = useNoteStore((s) => s.openNote)
  const showToast = useToastStore((s) => s.show)
  const [revisions, setRevisions] = useState<DriveRevision[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setIsLoading(true)
    setError(null)
    listRevisions(fileId)
      .then((list) => setRevisions([...list].reverse()))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load revisions'))
      .finally(() => setIsLoading(false))
  }, [isOpen, fileId])

  async function handleRestore(revisionId: string) {
    setRestoringId(revisionId)
    try {
      const content = await readRevision(fileId, revisionId)
      await updateFile(fileId, content)
      await openNote(fileId)
      onClose()
      showToast('Revision restored', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore revision')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Version history">
      {isLoading && <LoadingSpinner label="Loading revisions…" size={16} />}
      {error && (
        <p className="text-sm" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}
      {!isLoading && !error && revisions.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No earlier revisions yet — Drive keeps one each time this note is saved.
        </p>
      )}
      {!isLoading && revisions.length > 0 && (
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {revisions.map((rev) => (
            <li
              key={rev.id}
              className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span>{new Date(rev.modifiedTime).toLocaleString()}</span>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--accent-link)' }}
                disabled={restoringId !== null}
                onClick={() => handleRestore(rev.id)}
              >
                {restoringId === rev.id ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
