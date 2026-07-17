import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from './Modal'

interface PromptModalProps {
  isOpen: boolean
  title: string
  placeholder: string
  // Pre-fills the input — used by vault rename, where the field should
  // start with the vault's current name rather than blank.
  initialValue?: string
  submitLabel?: string
  onSubmit: (value: string) => void
  onClose: () => void
}

// Text-input-and-submit variant of Modal, used for "New Note"/"New Folder"
// name entry — a real modal instead of window.prompt(), which would be
// jarring in an otherwise polished app.
export function PromptModal({
  isOpen,
  title,
  placeholder,
  initialValue = '',
  submitLabel = 'Create',
  onSubmit,
  onClose,
}: PromptModalProps) {
  const [value, setValue] = useState(initialValue)
  // Guards against a real, confirmed bug: onSubmit (e.g. vault.store's
  // createNote) is async, but this modal has no way to know that — its
  // caller only closes it (setOpenModal(null)) as the *first* line of its
  // own async handler, meaning the actual close doesn't visibly commit
  // until React's next render, and Modal's own 0.15s exit animation leaves
  // the form interactive a little past even that. A fast double-click (or
  // Enter's OS-level key-repeat) on Create lands two genuine submit events
  // in that window, firing onSubmit twice — e.g. two identically-named
  // notes actually created. Sidestepped here directly rather than relying
  // on every caller to separately debounce its own async action.
  const [isSubmitting, setIsSubmitting] = useState(false)

  // This component stays mounted across opens (only Modal's inner content
  // animates in/out), so a fresh initialValue needs to be re-applied
  // explicitly each time it opens rather than relying on useState's
  // one-time initializer. Also where isSubmitting resets, so the guard
  // above doesn't leak into the next time this same modal instance opens.
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue)
      setIsSubmitting(false)
    }
  }, [isOpen, initialValue])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (isSubmitting) return
    const trimmed = value.trim()
    if (!trimmed) return
    setIsSubmitting(true)
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="rounded-md border px-2.5 py-1.5 text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm hover:opacity-80"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: 'var(--accent-link)', color: 'var(--bg-primary)' }}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
