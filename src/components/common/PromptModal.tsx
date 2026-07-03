import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'

interface PromptModalProps {
  isOpen: boolean
  title: string
  placeholder: string
  onSubmit: (value: string) => void
  onClose: () => void
}

// Text-input-and-submit variant of Modal, used for "New Note"/"New Folder"
// name entry — a real modal instead of window.prompt(), which would be
// jarring in an otherwise polished app.
export function PromptModal({ isOpen, title, placeholder, onSubmit, onClose }: PromptModalProps) {
  const [value, setValue] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
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
            className="rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
            style={{ background: 'var(--accent-link)', color: 'var(--bg-primary)' }}
          >
            Create
          </button>
        </div>
      </form>
    </Modal>
  )
}
