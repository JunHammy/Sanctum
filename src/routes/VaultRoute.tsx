import { useParams } from 'react-router-dom'
import { useFileTree } from '../hooks/useFileTree'
import { AppShell } from '../components/layout/AppShell'
import { NoteView } from '../components/editor/NoteView'

export function VaultRoute() {
  const { fileId } = useParams<{ fileId?: string }>()
  const { fileTree, isLoading, error, refresh } = useFileTree()

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
