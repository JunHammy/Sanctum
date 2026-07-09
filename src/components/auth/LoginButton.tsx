import { useAuthStore } from '../../stores/auth.store'

export function LoginButton() {
  const signIn = useAuthStore((s) => s.signIn)
  const isSigningIn = useAuthStore((s) => s.isSigningIn)

  return (
    <button
      type="button"
      disabled={isSigningIn}
      className="flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
      style={{ background: 'var(--accent-link)', color: 'var(--bg-primary)' }}
      onClick={() => signIn()}
    >
      {isSigningIn && (
        // Plain currentColor spinner, not the shared LoadingSpinner — that
        // component's border colors assume a neutral background, which
        // would be near-invisible against this button's own accent-colored
        // fill.
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {isSigningIn ? 'Signing in…' : 'Sign in with Google'}
    </button>
  )
}
