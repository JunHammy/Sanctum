import { Eye, Pencil } from 'lucide-react'
import { useNoteStore } from '../../stores/note.store'
import { toggleReadModePreservingScroll } from '../../lib/scroll-to-line'

export function ReadEditToggle() {
  const isReadMode = useNoteStore((s) => s.isReadMode)

  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:opacity-80"
      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      onClick={() => toggleReadModePreservingScroll()}
    >
      {isReadMode ? <Pencil size={14} /> : <Eye size={14} />}
      {isReadMode ? 'Edit' : 'Read'}
    </button>
  )
}
