import { useEffect, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'

export function AuthGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated && location.pathname !== '/login') {
      navigate('/login', { replace: true })
    } else if (isAuthenticated && location.pathname === '/login') {
      navigate('/vault', { replace: true })
    }
  }, [isAuthenticated, location.pathname, navigate])

  return <>{children}</>
}
