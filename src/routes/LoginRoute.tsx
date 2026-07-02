import { LoginButton } from '../components/auth/LoginButton'

export function LoginRoute() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold sm:text-4xl" style={{ color: 'var(--accent-heading)' }}>
        Sanctum
      </h1>
      <p className="max-w-xs sm:max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        A private markdown vault backed by your own Google Drive.
      </p>
      <LoginButton />
    </div>
  )
}
