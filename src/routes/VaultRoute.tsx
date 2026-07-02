import { useAuthStore } from '../stores/auth.store'

export function VaultRoute() {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      {user?.avatar && (
        <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full" />
      )}
      <p style={{ color: 'var(--text-primary)' }}>{user?.name}</p>
      <p style={{ color: 'var(--text-secondary)' }}>{user?.email}</p>
      <p style={{ color: 'var(--text-muted)' }}>Vault browsing — coming next in Phase 1.</p>
      <button
        type="button"
        className="rounded-md border px-4 py-2 text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        onClick={() => signOut()}
      >
        Sign out
      </button>
    </div>
  )
}
