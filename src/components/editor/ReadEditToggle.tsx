import { Eye, Pencil } from 'lucide-react'
import { useNoteStore } from '../../stores/note.store'
import { useNetworkStore } from '../../stores/network.store'
import { toggleReadModePreservingScroll } from '../../lib/scroll-to-line'

export function ReadEditToggle() {
  const isReadMode = useNoteStore((s) => s.isReadMode)
  const isOnline = useNetworkStore((s) => s.isOnline)
  const disabled = isReadMode && !isOnline

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? 'Editing is disabled while offline' : undefined}
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50"
      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      onClick={() => toggleReadModePreservingScroll()}
    >
      {isReadMode ? <Pencil size={14} /> : <Eye size={14} />}
      {/* "Edit"/"Read" are both 4 characters, but different glyph widths
          (e.g. narrow "i" vs wider "a") still render at slightly different
          pixel widths — enough to nudge the divider/avatar/sign-out button
          next to this in the header on every toggle. A fixed min-width
          keeps the button's footprint constant regardless of which word is
          showing. */}
      <span className="inline-block" style={{ minWidth: '4ch' }}>
        {isReadMode ? 'Edit' : 'Read'}
      </span>
    </button>
  )
}
