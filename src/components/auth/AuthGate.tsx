import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'

// Redirects are returned directly from render (via <Navigate>) rather than
// triggered from a useEffect. An effect-based navigate() only runs after
// the current render has already painted — so the instant sign-in flips
// isAuthenticated to true, there'd be one full frame where the stale
// LoginRoute (Sanctum heading + Sign in button) is still on screen before
// the effect fires and swaps to /vault. Returning <Navigate> here instead
// means that frame never renders the stale children at all.
export function AuthGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const location = useLocation()

  // zustand's persist middleware hydrates sessionStorage asynchronously,
  // even though sessionStorage itself is synchronous — right after a page
  // refresh there's a brief window where `isAuthenticated`/`token` still
  // hold their unhydrated initial (signed-out) values. Rendering nothing
  // until hydration completes means VaultRoute/NoteView never mount (and
  // never fire a Drive API call) with a token that just hasn't loaded yet
  // — previously, a note opened in that window would fail with "Not signed
  // in" and never automatically retry, since openNote marks the note as
  // already-attempted before the fetch even runs.
  if (!hasHydrated) return null

  if (!isAuthenticated && location.pathname !== '/login') {
    return <Navigate to="/login" replace />
  }
  if (isAuthenticated && location.pathname === '/login') {
    return <Navigate to="/vault" replace />
  }

  return <>{children}</>
}
