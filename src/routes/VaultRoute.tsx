import { useAuthStore } from '../stores/auth.store'
import { useFileTree } from '../hooks/useFileTree'
import { FileTree } from '../components/sidebar/FileTree'

export function VaultRoute() {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const { fileTree, isLoading, error } = useFileTree()

  return (
    <div className="min-h-screen">
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

      <main className="mx-auto max-w-md px-2 py-4 sm:max-w-lg">
        {isLoading && <p style={{ color: 'var(--text-secondary)' }}>Loading vault…</p>}
        {error && <p style={{ color: 'var(--error)' }}>{error}</p>}
        {!isLoading && !error && <FileTree nodes={fileTree} />}
      </main>
    </div>
  )
}
