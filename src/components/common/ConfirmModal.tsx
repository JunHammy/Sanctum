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
          className="rounded px-3 py-1.5 text-sm hover:opacity-80"
          style={{ background: 'var(--error)', color: 'white' }}
          onClick={() => {
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
