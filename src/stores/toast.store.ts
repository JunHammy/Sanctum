import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'loading'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

interface PromiseToastMessages<T> {
  loading: string
  success: string | ((value: T) => string)
  error?: string | ((err: unknown) => string)
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, type?: ToastType) => string
  update: (id: string, message: string, type: ToastType) => void
  dismiss: (id: string) => void
  // A single toast that morphs through a whole async action's lifecycle
  // (loading → success/error) instead of either nothing showing at all
  // while it runs, or only an error toast if it happens to fail — the gap
  // this was added for: exports/backups had no in-progress or success
  // feedback, only ever an error one. Re-throws on failure (after already
  // updating the toast) so a caller's own try/catch — for `logError`,
  // primarily — still runs normally.
  promise: <T>(fn: () => Promise<T>, messages: PromiseToastMessages<T>) => Promise<T>
}

const AUTO_DISMISS_MS = 3000

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  show: (message, type = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set({ toasts: [...get().toasts, { id, message, type }] })
    // A loading toast represents an in-progress action of unknown
    // duration — it stays open until update() morphs it into a final
    // success/error state (which schedules its own dismiss), not on this
    // fixed timer.
    if (type !== 'loading') setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS)
    return id
  },

  update: (id, message, type) => {
    set({ toasts: get().toasts.map((t) => (t.id === id ? { ...t, message, type } : t)) })
    if (type !== 'loading') setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS)
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  promise: async (fn, messages) => {
    const id = get().show(messages.loading, 'loading')
    try {
      const result = await fn()
      const successMessage = typeof messages.success === 'function' ? messages.success(result) : messages.success
      get().update(id, successMessage, 'success')
      return result
    } catch (err) {
      const errorMessage =
        typeof messages.error === 'function' ? messages.error(err) : (messages.error ?? 'Something went wrong')
      get().update(id, errorMessage, 'error')
      throw err
    }
  },
}))
