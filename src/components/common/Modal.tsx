import { useEffect, type ReactNode } from 'react'
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="w-full max-w-sm rounded-lg border p-4 shadow-lg"
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
    </AnimatePresence>
  )
}
