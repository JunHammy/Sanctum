import { useParams } from 'react-router-dom'
import { useAuthStore } from '../stores/auth.store'
import { useFileTree } from '../hooks/useFileTree'
import { FileTree } from '../components/sidebar/FileTree'
import { NoteView } from '../components/editor/NoteView'

export function VaultRoute() {
  const { fileId } = useParams<{ fileId?: string }>()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const { fileTree, isLoading, error, refresh } = useFileTree()

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="font-semibold" style={{ color: 'var(--accent-heading)' }}>
          Sanctum
        </span>
        <div className="flex items-center gap-2">
          {user?.avatar && (
            <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />
          )}
          <span className="hidden text-sm sm:inline" style={{ color: 'var(--text-secondary)' }}>
            {user?.name}
          </span>
          <button
            type="button"
            className="rounded-md border px-3 py-1 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col sm:flex-row">
        <aside
          className="shrink-0 border-b px-2 py-3 sm:w-64 sm:border-b-0 sm:border-r sm:py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="mb-2 flex items-center justify-between px-2">
            <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Vault
            </span>
            <button
              type="button"
              className="text-xs hover:opacity-80"
              style={{ color: 'var(--accent-link)' }}
              onClick={() => refresh()}
              disabled={isLoading}
            >
              Refresh
            </button>
          </div>
          {isLoading && <p style={{ color: 'var(--text-secondary)' }}>Loading vault…</p>}
          {error && <p style={{ color: 'var(--error)' }}>{error}</p>}
          {!isLoading && !error && <FileTree nodes={fileTree} />}
        </aside>

        <main className="flex-1 px-4 py-4">
          {fileId ? (
            <NoteView fileId={fileId} />
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Select a note from the sidebar.</p>
          )}
        </main>
      </div>
    </div>
  )
}
