import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useFileTree } from '../hooks/useFileTree'
import { AppShell } from '../components/layout/AppShell'
import { NoteView } from '../components/editor/NoteView'
import { useNoteStore } from '../stores/note.store'

export function VaultRoute() {
  const { fileId } = useParams<{ fileId?: string }>()
  const { fileTree, isLoading, error, refresh } = useFileTree()
  const resetNote = useNoteStore((s) => s.reset)

  // Landing on the bare /vault route (no fileId) means no note is open —
  // e.g. closing a tab with nothing else left to fall back to (TabBar's
  // handleClose navigates here). Without this, note.store's activeNoteId
  // just keeps pointing at whatever was last open (NoteView unmounts, but
  // nothing else ever clears it), so Header kept showing Export/History/
  // the Edit toggle for a note that isn't actually open anymore.
  useEffect(() => {
    if (!fileId) resetNote()
  }, [fileId, resetNote])

  return (
    <AppShell fileTree={fileTree} isLoading={isLoading} error={error} onRefresh={refresh}>
      {fileId ? (
        <NoteView fileId={fileId} />
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>Select a note from the sidebar.</p>
      )}
    </AppShell>
  )
}
