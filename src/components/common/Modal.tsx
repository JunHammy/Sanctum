import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

// AnimatePresence is what makes an *exit* transition possible at all here —
// plain conditional rendering (the old `if (!isOpen) return null`) removes
// the DOM the instant isOpen flips, with no chance to animate out. Reused
// by PromptModal/SearchModal/QuickSwitcher/RevisionsPanel, so this one
// change gives all of them a real open/close transition for free.
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Portaled to document.body rather than rendered inline wherever the
  // caller happens to sit in the tree — confirmed directly: ConfirmModal
  // (invoked from inside FileTreeNode's per-row delete button, itself
  // inside a div with `hover:opacity-80`) rendered fully transparent
  // while the cursor was still hovering that row. CSS opacity on an
  // ancestor forces its *entire* subtree — including a `position: fixed`
  // descendant, which normally escapes the parent's layout but not its
  // compositing — to render through that same reduced-opacity layer. A
  // portal makes every modal a direct child of body, immune to this
  // regardless of which component happens to open it.
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="w-full max-w-lg rounded-lg border p-6 shadow-lg"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
