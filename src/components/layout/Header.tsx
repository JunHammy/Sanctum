import { Menu, LogOut, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { useUIStore } from '../../stores/ui.store'
import { useNoteStore } from '../../stores/note.store'
import { ReadEditToggle } from '../editor/ReadEditToggle'

export function Header() {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const activeNoteId = useNoteStore((s) => s.activeNoteId)
  const isDirty = useNoteStore((s) => s.isDirty)
  const isSaving = useNoteStore((s) => s.isSaving)

  return (
    <header
      className="flex items-center justify-between gap-2 border-b px-3 py-3 sm:px-4"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          aria-label="Toggle sidebar"
          className="rounded p-1.5 hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          onClick={() => toggleSidebar()}
        >
          <Menu size={18} />
        </button>
        <span className="font-semibold" style={{ color: 'var(--accent-heading)' }}>
          Sanctum
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {activeNoteId && (
          <>
            <span className="hidden text-xs sm:inline" style={{ color: 'var(--text-muted)' }}>
              {isSaving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'Saved'}
            </span>
            <ReadEditToggle />
          </>
        )}
        <button
          type="button"
          aria-label="Toggle theme"
          className="rounded p-1.5 hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          onClick={() => toggleTheme()}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {user?.avatar && (
          <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />
        )}
        <span className="hidden text-sm md:inline" style={{ color: 'var(--text-secondary)' }}>
          {user?.name}
        </span>
        <button
          type="button"
          aria-label="Sign out"
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm hover:opacity-80 sm:px-3"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          onClick={() => signOut()}
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  )
}
