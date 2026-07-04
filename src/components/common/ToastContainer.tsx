import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useToastStore, type ToastType } from '../../stores/toast.store'

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const COLORS: Record<ToastType, string> = {
  success: 'var(--success)',
  error: 'var(--error)',
  info: 'var(--accent-link)',
}

// Mounted once at the app root (App.tsx) so any store action anywhere can
// call useToastStore.getState().show(...) without needing to be inside a
// particular component tree.
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="fixed right-4 bottom-4 z-[2000] flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type]
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-lg"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <Icon size={16} style={{ color: COLORS[toast.type] }} />
              <span>{toast.message}</span>
              <button
                type="button"
                aria-label="Dismiss"
                className="ml-1 rounded p-0.5 hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => dismiss(toast.id)}
              >
                <X size={12} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
