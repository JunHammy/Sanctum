import { useState } from 'react'
import { Menu, LogOut, Sun, Moon, History, Search, RefreshCw, Download } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { useUIStore } from '../../stores/ui.store'
import { useNoteStore } from '../../stores/note.store'
import { ReadEditToggle } from '../editor/ReadEditToggle'
import { RevisionsPanel } from '../editor/RevisionsPanel'
import { ExportMenu } from '../editor/ExportMenu'

interface HeaderProps {
  onOpenSearch: () => void
}

// Three-column navbar layout — left (nav/branding), center (search, the
// thing you reach for most often, so it gets the most prominent spot),
// right (note-specific controls + account). Previously search was a small
// icon squeezed into the same row as save-status/theme/avatar/sign-out,
// which read as cluttered rather than like a real product navbar.
export function Header({ onOpenSearch }: HeaderProps) {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const signIn = useAuthStore((s) => s.signIn)
  const needsReconnect = useAuthStore((s) => s.needsReconnect)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const activeNoteId = useNoteStore((s) => s.activeNoteId)
  const isDirty = useNoteStore((s) => s.isDirty)
  const isSaving = useNoteStore((s) => s.isSaving)
  const [revisionsOpen, setRevisionsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <header
      className="flex items-center gap-2 border-b px-3 py-3 sm:px-4"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          aria-label="Toggle sidebar"
          className="rounded p-1.5 hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          onClick={() => toggleSidebar()}
        >
          <Menu size={18} />
        </button>
        <span className="hidden font-semibold sm:inline" style={{ color: 'var(--accent-heading)' }}>
          Sanctum
        </span>
      </div>

      <div className="flex min-w-0 flex-1 justify-center px-1">
        <button
          type="button"
          onClick={onOpenSearch}
          title="Search (Ctrl+Shift+F)"
          className="flex w-full max-w-md items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm hover:opacity-80"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
        >
          <Search size={14} className="shrink-0" />
          <span className="hidden truncate sm:inline">Search notes…</span>
          <kbd
            className="ml-auto hidden shrink-0 rounded border px-1.5 py-0.5 text-xs opacity-70 md:inline"
            style={{ borderColor: 'var(--border)' }}
          >
            Ctrl+Shift+F
          </kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {needsReconnect && (
          // Background silent token refresh always fails here (Google's
          // client falls back to a popup for it, and a background timer
          // isn't a user gesture, so browsers block it) — this is the
          // one-click fix, clicked by an actual person, so the popup this
          // opens is allowed. Left visible until clicked (not a toast that
          // disappears) since it stays actionable for several minutes.
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:opacity-80"
            style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}
            onClick={() => signIn()}
          >
            <RefreshCw size={14} />
            <span className="hidden sm:inline">Reconnect</span>
          </button>
        )}
        {activeNoteId && (
          <>
            <span className="hidden text-xs sm:inline" style={{ color: 'var(--text-muted)' }}>
              {isSaving ? 'Saving…' : isDirty ? 'Unsaved changes' : 'Saved'}
            </span>
            <button
              type="button"
              aria-label="Version history"
              title="Version history"
              className="rounded p-1.5 hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setRevisionsOpen(true)}
            >
              <History size={16} />
            </button>
            <button
              type="button"
              aria-label="Export note"
              title="Export note"
              className="rounded p-1.5 hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setExportOpen(true)}
            >
              <Download size={16} />
            </button>
            <ReadEditToggle />
            <span className="hidden h-5 w-px sm:inline" style={{ background: 'var(--border)' }} aria-hidden="true" />
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
      {activeNoteId && (
        <>
          <RevisionsPanel fileId={activeNoteId} isOpen={revisionsOpen} onClose={() => setRevisionsOpen(false)} />
          <ExportMenu fileId={activeNoteId} isOpen={exportOpen} onClose={() => setExportOpen(false)} />
        </>
      )}
    </header>
  )
}
