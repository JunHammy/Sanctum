import { useAuthStore } from '../../stores/auth.store'

export function LoginButton() {
  const signIn = useAuthStore((s) => s.signIn)

  return (
    <button
      type="button"
      className="rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
      style={{ background: 'var(--accent-link)', color: 'var(--bg-primary)' }}
      onClick={() => signIn()}
    >
      Sign in with Google
    </button>
  )
}
