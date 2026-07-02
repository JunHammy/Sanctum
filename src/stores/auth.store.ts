import { create } from 'zustand'
import * as authService from '../services/auth.service'
import type { AuthUser } from '../services/auth.service'

interface AuthState {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  error: string | null
  signIn: () => Promise<void>
  signOut: () => void
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  error: null,

  signIn: async () => {
    set({ error: null })
    try {
      const token = await authService.requestAccessToken()
      const user = await authService.fetchUserInfo(token)
      set({ token, user, isAuthenticated: true, error: null })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Sign-in failed' })
    }
  },

  signOut: () => {
    const token = get().token
    if (token) authService.revokeToken(token)
    set({ token: null, user: null, isAuthenticated: false })
  },
}))
