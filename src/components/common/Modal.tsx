import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  // 'large' is for content that needs real room (e.g. the table expand
  // view) — near-viewport-sized instead of the default small dialog.
  size?: 'default' | 'large'
  // Stamped onto the portaled panel as `data-block-id` when set. Needed
  // because this component portals to document.body — outside whatever
  // DOM subtree the caller lives in — so an ancestor-scoped click-outside
  // listener (like BlockEditor's `target.closest('[data-block-id=...]')`
  // check) would otherwise see any click inside this modal as "outside"
  // the block and deactivate it. `.closest()` walks the real DOM, so
  // stamping the same attribute here is enough to keep it recognized as
  // still part of that block despite the portal.
  dataBlockId?: string
}

// AnimatePresence is what makes an *exit* transition possible at all here —
// plain conditional rendering (the old `if (!isOpen) return null`) removes
// the DOM the instant isOpen flips, with no chance to animate out. Reused
// by PromptModal/SearchModal/QuickSwitcher/RevisionsPanel, so this one
// change gives all of them a real open/close transition for free.
export function Modal({ isOpen, onClose, title, children, size = 'default', dataBlockId }: ModalProps) {
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
            data-block-id={dataBlockId}
            className={
              size === 'large'
                ? 'flex max-h-[90vh] w-full max-w-[95vw] flex-col rounded-lg border p-6 shadow-lg'
                : 'w-full max-w-lg rounded-lg border p-6 shadow-lg'
            }
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <h2 className="mb-3 shrink-0 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h2>
            {size === 'large' ? (
              // min-h-0 matters here for the same reason min-w-0 matters on
              // ContentPane's <main> (see that file's comment) — this div is
              // a flex item in a flex-col panel, so without it, tall content
              // (a table with many rows) refuses to shrink and pushes the
              // panel past max-h-[90vh] instead of scrolling inside it.
              <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            ) : (
              children
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
