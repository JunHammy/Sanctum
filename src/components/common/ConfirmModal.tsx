import { useEffect, useState } from 'react'
import { Modal } from './Modal'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}

// This app's established convention is a real Modal instead of a native
// dialog for user input (PromptModal replaced window.prompt() for the
// same reason) — a destructive yes/no confirmation deserves the same
// treatment rather than reaching for window.confirm().
export function ConfirmModal({ isOpen, title, message, confirmLabel = 'Delete', onConfirm, onClose }: ConfirmModalProps) {
  // Same double-click guard as PromptModal, for the same reason: onConfirm
  // is typically an async store action the caller doesn't await here, and
  // Modal's own exit animation leaves the button interactive a little past
  // the click that starts closing it — a fast double-click could otherwise
  // fire onConfirm twice.
  const [isConfirming, setIsConfirming] = useState(false)

  useEffect(() => {
    if (isOpen) setIsConfirming(false)
  }, [isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {message}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm hover:opacity-80"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isConfirming}
          className="rounded px-3 py-1.5 text-sm hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: 'var(--error)', color: 'white' }}
          onClick={() => {
            if (isConfirming) return
            setIsConfirming(true)
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
