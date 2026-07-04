import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import * as authService from '../services/auth.service'
import type { AuthUser } from '../services/auth.service'
import { useNoteStore } from './note.store'
import { useToastStore } from './toast.store'
import { logError } from '../lib/error-messages'

// Only the Drive scope actually gates API calls — userinfo scopes aren't
// worth failing a refresh over.
const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/drive'

interface AuthState {
  token: string | null
  user: AuthUser | null
  tokenExpiresAt: number | null
  isAuthenticated: boolean
  error: string | null
  signIn: () => Promise<void>
  signOut: () => void
  scheduleRefresh: () => void
}

// Access tokens expire in ~1hr; without proactive renewal, the next Drive
// call after expiry 401s and force-signs-out mid-edit with zero warning —
// refresh a few minutes early instead, silently, so that never happens
// during a normal working session.
const REFRESH_BUFFER_MS = 5 * 60 * 1000
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
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
          // The scope check inside scheduleRefresh only guards *silent*
          // renewal — the interactive sign-in itself was never verified.
          // Google's consent screen leaves the Drive-access checkbox
          // unchecked by default while Sanctum is an unverified app
          // requesting a sensitive scope, so it's easy to click Continue
          // without granting Drive access at all: sign-in "succeeds" but
          // every subsequent Drive call then 403s with a cryptic scope
          // error. Catch that here instead, while it's still fixable by
          // just signing in again and checking the box.
          const hasScope = await authService.tokenHasScope(accessToken, REQUIRED_SCOPE)
          if (!hasScope) {
            throw new Error(
              'Sign-in did not grant Drive access. Please try again and check the box granting Drive access on the Google screen.',
            )
          }
          const user = await authService.fetchUserInfo(accessToken)
          set({
            token: accessToken,
            user,
            tokenExpiresAt: Date.now() + expiresIn * 1000,
            isAuthenticated: true,
            error: null,
          })
          get().scheduleRefresh()
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sign-in failed'
          logError('auth.signIn', err)
          useToastStore.getState().show(message, 'error')
          set({ error: message })
        }
      },

      signOut: () => {
        clearRefreshTimer()
        const token = get().token
        if (token) authService.revokeToken(token)
        set({ token: null, user: null, tokenExpiresAt: null, isAuthenticated: false })
        // Otherwise a note that failed to load under the old session (e.g.
        // an expired token) leaves behind a stale error + activeNoteId that
        // survives the sign-out/sign-in cycle untouched, silently blocking
        // a retry after re-authenticating.
        useNoteStore.getState().reset()
      },

      scheduleRefresh: () => {
        clearRefreshTimer()
        const { tokenExpiresAt } = get()
        if (!tokenExpiresAt) return

        const delay = Math.max(0, tokenExpiresAt - Date.now() - REFRESH_BUFFER_MS)
        refreshTimer = setTimeout(async () => {
          try {
            const { accessToken, expiresIn } = await authService.requestAccessToken({ silent: true })
            // Google can report success while quietly downgrading the scope
            // for a sensitive permission like full Drive access, since it
            // isn't reliably re-granted without an interactive consent
            // screen — swapping in a token like that would silently break
            // every Drive call. Verify before trusting it.
            const hasScope = await authService.tokenHasScope(accessToken, REQUIRED_SCOPE)
            if (!hasScope) {
              // Leave the current (still technically valid) token in place
              // rather than replace it with a broken one. If it's genuinely
              // near expiry, the reactive 401 → sign-out path still covers
              // that — this just declines to make things worse. No toast:
              // this is a deliberate silent recovery, not a user-facing
              // failure — but still worth a log line for production tracing.
              logError('auth.scheduleRefresh', new Error('Silent refresh returned a scope-downgraded token; kept existing token'))
              return
            }
            set({ token: accessToken, tokenExpiresAt: Date.now() + expiresIn * 1000 })
            get().scheduleRefresh()
          } catch (err) {
            // Silent renewal itself failing (e.g. user revoked access
            // elsewhere, or offline) — leave the current token in place;
            // the reactive 401 → sign-out path covers genuine expiry.
            logError('auth.scheduleRefresh', err)
          }
        }, delay)
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
        if (!state) return
        if (state.tokenExpiresAt && state.tokenExpiresAt < Date.now()) {
          state.token = null
          state.user = null
          state.tokenExpiresAt = null
          state.isAuthenticated = false
        } else {
          state.scheduleRefresh()
        }
      },
    },
  ),
)
