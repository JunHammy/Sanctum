import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import * as authService from '../services/auth.service'
import type { AuthUser } from '../services/auth.service'

interface AuthState {
  token: string | null
  user: AuthUser | null
  tokenExpiresAt: number | null
  isAuthenticated: boolean
  error: string | null
  signIn: () => Promise<void>
  signOut: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      tokenExpiresAt: null,
      isAuthenticated: false,
      error: null,

      signIn: async () => {
        set({ error: null })
        try {
          const { accessToken, expiresIn } = await authService.requestAccessToken()
          const user = await authService.fetchUserInfo(accessToken)
          set({
            token: accessToken,
            user,
            tokenExpiresAt: Date.now() + expiresIn * 1000,
            isAuthenticated: true,
            error: null,
          })
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Sign-in failed' })
        }
      },

      signOut: () => {
        const token = get().token
        if (token) authService.revokeToken(token)
        set({ token: null, user: null, tokenExpiresAt: null, isAuthenticated: false })
      },
    }),
    {
      // sessionStorage (not localStorage): the token shouldn't outlive the
      // browser tab, but should survive a page reload within it.
      name: 'sanctum-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        tokenExpiresAt: state.tokenExpiresAt,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.tokenExpiresAt && state.tokenExpiresAt < Date.now()) {
          state.token = null
          state.user = null
          state.tokenExpiresAt = null
          state.isAuthenticated = false
        }
      },
    },
  ),
)
