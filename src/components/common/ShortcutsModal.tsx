import { Modal } from './Modal'

interface ShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Ctrl+Shift+K', label: 'Open command palette' },
  { keys: 'Ctrl+O', label: 'Go to note (quick switcher)' },
  { keys: 'Ctrl+Shift+F', label: 'Search notes' },
  { keys: 'Ctrl+E', label: 'Toggle Read/Edit mode' },
  { keys: 'Ctrl+S', label: 'Save note' },
  { keys: 'Ctrl+Z', label: 'Undo' },
  { keys: 'Ctrl+Shift+Z', label: 'Redo' },
  { keys: 'Esc', label: 'Close a modal' },
]

// Plain reference list, not itself interactive — reachable from the command
// palette (and could gain its own shortcut later if it turns out to be used
// often enough to deserve one).
export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts">
      <div className="flex flex-col gap-1">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="flex items-center justify-between gap-4 rounded px-1 py-1.5">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {s.label}
            </span>
            <kbd
              className="shrink-0 rounded border px-1.5 py-0.5 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  )
}
