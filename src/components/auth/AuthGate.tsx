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
  const location = useLocation()

  if (!isAuthenticated && location.pathname !== '/login') {
    return <Navigate to="/login" replace />
  }
  if (isAuthenticated && location.pathname === '/login') {
    return <Navigate to="/vault" replace />
  }

  return <>{children}</>
}
