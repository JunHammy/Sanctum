export function LoginButton() {
  return (
    <button
      type="button"
      className="rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
      style={{ background: 'var(--accent-link)', color: 'var(--bg-primary)' }}
      onClick={() => console.info('Google sign-in not wired up yet — Phase 1')}
    >
      Sign in with Google
    </button>
  )
}
