import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Menu,
  LogOut,
  Sun,
  Moon,
  History,
  Search,
  RefreshCw,
  Download,
  HelpCircle,
  Command,
  Keyboard,
  BookOpen,
  WifiOff,
  MoreHorizontal,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useAuthStore } from '../../stores/auth.store'
import { useUIStore } from '../../stores/ui.store'
import { useNoteStore } from '../../stores/note.store'
import { useNetworkStore } from '../../stores/network.store'
import { ReadEditToggle } from '../editor/ReadEditToggle'
import { RevisionsPanel } from '../editor/RevisionsPanel'
import { ExportMenu } from '../editor/ExportMenu'
import { ShortcutsModal } from '../common/ShortcutsModal'

interface HeaderProps {
  onOpenSearch: () => void
  // Only provided inside a vault (AppShell) — the vault manager and help
  // pages don't have a CommandPalette instance mounted, so that entry is
  // simply omitted there rather than shown and doing nothing.
  onOpenCommandPalette?: () => void
}

// Three-column navbar layout — left (nav/branding), center (search, the
// thing you reach for most often, so it gets the most prominent spot),
// right (note-specific controls + account). Previously search was a small
// icon squeezed into the same row as save-status/theme/avatar/sign-out,
// which read as cluttered rather than like a real product navbar.
//
// Centering note: the center column is a plain `flex-1 justify-center`
// between two `shrink-0` side blocks, so it's centered in the LEFTOVER
// space, not the true viewport center — visibly off when the right block
// (many more icons than the left) is much wider. A `1fr auto 1fr` grid was
// tried to fix this mathematically and made things much worse: an
// `auto`-sized track holding a `width:100%` child that itself contains a
// `margin-left:auto` element is a genuine circular sizing reference with no
// single correct browser resolution — confirmed via testing as overlapping
// text at some widths and a fully collapsed search bar at others, at every
// width tried. Reverted entirely. The actual fix for the asymmetry is
// below: shrink the right block's icon count on narrower screens (History/
// Export/Command palette collapse into the new "•••" overflow menu below
// `lg:`), which both looks better on its own and makes the plain leftover-
// space centering close enough to not be visually distracting.
export function Header({ onOpenSearch, onOpenCommandPalette }: HeaderProps) {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const signIn = useAuthStore((s) => s.signIn)
  const needsReconnect = useAuthStore((s) => s.needsReconnect)
  const isSigningIn = useAuthStore((s) => s.isSigningIn)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const activeNoteId = useNoteStore((s) => s.activeNoteId)
  const isDirty = useNoteStore((s) => s.isDirty)
  const isSaving = useNoteStore((s) => s.isSaving)
  const isOnline = useNetworkStore((s) => s.isOnline)
  const [revisionsOpen, setRevisionsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [helpMenuOpen, setHelpMenuOpen] = useState(false)
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const helpMenuRef = useRef<HTMLDivElement>(null)
  const overflowMenuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Same anchored-dropdown/click-outside convention as the sidebar's "•••"
  // and vault-switcher menus.
  useEffect(() => {
    if (!helpMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (helpMenuRef.current && !helpMenuRef.current.contains(e.target as Node)) setHelpMenuOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setHelpMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [helpMenuOpen])

  useEffect(() => {
    if (!overflowMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) setOverflowMenuOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOverflowMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [overflowMenuOpen])

  const hasOverflowItems = activeNoteId != null || onOpenCommandPalette != null

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
          {/* 16, not 18 — confirmed real bug via testing: this is the
              row's leftmost icon, sign-out is the rightmost, and every
              other icon in the row is already 16px. The two edge icons
              being the only mismatched sizes (18 and 14) is what kept
              reading as uneven padding even after the button padding
              itself was made identical. */}
          <Menu size={16} />
        </button>
        <button
          type="button"
          className="hidden font-semibold hover:opacity-80 sm:inline"
          style={{ color: 'var(--accent-heading)' }}
          onClick={() => navigate('/vaults')}
        >
          Sanctum
        </button>
      </div>

      {/* Confirmed real bug from testing: no amount of padding/centering-math
          fixes a search bar that's trying to visually center itself between
          a tiny left block (just a hamburger) and a much wider right block
          (edit toggle, overflow menu, help, theme, avatar, sign-out) —
          leftover-space centering will always look off when the two sides
          are that unequal, and forcing true mathematical centering (tried
          via CSS Grid) either overflowed or collapsed the bar entirely at
          different widths. The actual fix: don't attempt a centered search
          bar below `lg:` (1024px, the same breakpoint the overflow menu
          already uses) at all — below it, this is just an empty flexible
          spacer (standard "nav left, spacer, actions right" toolbar shape,
          nothing being centered so there's nothing to get wrong), and a
          plain search icon lives in the right-hand icon row instead (below).
          At `lg:` and up, where both sides are simple + the imbalance reads
          as negligible (confirmed fine on an actual laptop width), the full
          centered bar with placeholder text + kbd hint takes over. */}
      {/* This wrapper itself always stays `flex flex-1` — it's what pushes
          the left and right blocks apart to the opposite edges even below
          `lg:`, where it renders as an empty spacer (the button inside is
          hidden, not this wrapper) rather than disappearing from the layout
          entirely, which would let the left/right blocks collapse together
          with only the header's own small `gap-2` between them. */}
      <div className="flex min-w-0 flex-1 justify-center px-1">
        <button
          type="button"
          onClick={onOpenSearch}
          title="Search (Ctrl+Shift+F)"
          className="hidden w-full min-w-0 max-w-md items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm hover:opacity-80 lg:flex"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
        >
          <Search size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search notes…</span>
          <kbd
            className="ml-auto shrink-0 rounded border px-1.5 py-0.5 text-xs opacity-70"
            style={{ borderColor: 'var(--border)' }}
          >
            Ctrl+Shift+F
          </kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Plain icon counterpart to the full search bar above, shown only
            below `lg:` (where that bar is hidden) — search stays reachable
            below desktop width, just as a normal icon in the row instead of
            a specially-centered element. */}
        <button
          type="button"
          aria-label="Search"
          title="Search (Ctrl+Shift+F)"
          className="rounded p-1.5 hover:opacity-80 lg:hidden"
          style={{ color: 'var(--text-secondary)' }}
          onClick={onOpenSearch}
        >
          <Search size={16} />
        </button>
        {!isOnline && (
          // Persistent, not a toast — a toast auto-dismisses after a few
          // seconds, but "you're offline" stays true and relevant for the
          // whole time it's true. Shared by AppShell and VaultManagerRoute
          // (both render this same Header), so one change covers both.
          <span
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm"
            style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}
          >
            <WifiOff size={14} />
            <span className="hidden sm:inline">Offline — read-only</span>
          </span>
        )}
        {needsReconnect && (
          // Background silent token refresh always fails here (Google's
          // client falls back to a popup for it, and a background timer
          // isn't a user gesture, so browsers block it) — this is the
          // one-click fix, clicked by an actual person, so the popup this
          // opens is allowed. Left visible until clicked (not a toast that
          // disappears) since it stays actionable for several minutes.
          <button
            type="button"
            disabled={isSigningIn}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}
            onClick={() => signIn()}
          >
            <RefreshCw size={14} className={isSigningIn ? 'animate-spin' : undefined} />
            <span className="hidden sm:inline">{isSigningIn ? 'Reconnecting…' : 'Reconnect'}</span>
          </button>
        )}
        {activeNoteId && (
          <>
            {/* min-w sized to the longest of the four possible strings
                ("Unsaved changes") and right-aligned — without this, the
                icon buttons that follow visibly shift left/right every time
                this text changes length (e.g. "Saving…" <-> "Saved"), which
                reads as a layout glitch since it happens on essentially
                every keystroke/save cycle. */}
            <span
              className="hidden min-w-[6.5rem] text-right text-xs sm:inline"
              style={{ color: 'var(--text-muted)' }}
            >
              {/* isDirty takes priority over the offline pill above: a
                  pending edit should keep reading "Unsaved changes" so it's
                  clear something is still waiting to sync, not just that the
                  connection is down. */}
              {isSaving ? 'Saving…' : isDirty ? 'Unsaved changes' : !isOnline ? 'Offline' : 'Saved'}
            </span>
            {/* Version history / Export only at lg: and up — below that they
                fold into the "•••" overflow menu (see below) instead, along
                with Command palette. This is the actual fix for the right
                block being far wider than the left: fewer always-visible
                icons on narrower screens, not a CSS centering trick. */}
            <button
              type="button"
              aria-label="Version history"
              title="Version history"
              className="hidden rounded p-1.5 hover:opacity-80 lg:inline-flex"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setRevisionsOpen(true)}
            >
              <History size={16} />
            </button>
            <button
              type="button"
              aria-label="Export note"
              title="Export note"
              className="hidden rounded p-1.5 hover:opacity-80 lg:inline-flex"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setExportOpen(true)}
            >
              <Download size={16} />
            </button>
            <ReadEditToggle />
            <span className="hidden h-5 w-px sm:inline" style={{ background: 'var(--border)' }} aria-hidden="true" />
          </>
        )}
        {/* Command palette gets its own single-click icon at lg: and up —
            it's an action launcher, not reference material, so it doesn't
            belong bundled inside the "?" help menu (genuinely just docs).
            Below lg: it folds into the "•••" overflow menu instead. Only
            shown inside a vault, where the palette actually exists. */}
        {onOpenCommandPalette && (
          <button
            type="button"
            aria-label="Command palette"
            title="Command palette (Ctrl+Shift+K)"
            className="hidden rounded p-1.5 hover:opacity-80 lg:inline-flex"
            style={{ color: 'var(--text-secondary)' }}
            onClick={onOpenCommandPalette}
          >
            <Command size={16} />
          </button>
        )}
        {hasOverflowItems && (
          <div className="relative lg:hidden" ref={overflowMenuRef}>
            <button
              type="button"
              aria-label="More actions"
              title="More actions"
              className="rounded p-1.5 hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setOverflowMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={16} />
            </button>
            <AnimatePresence>
              {overflowMenuOpen && (
                <motion.div
                  className="absolute top-full right-0 z-50 mt-1 w-52 rounded-md border p-1 shadow-lg"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                >
                  {activeNoteId && (
                    <>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)]"
                        onClick={() => {
                          setOverflowMenuOpen(false)
                          setRevisionsOpen(true)
                        }}
                      >
                        <History size={16} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ color: 'var(--text-primary)' }}>Version history</span>
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)]"
                        onClick={() => {
                          setOverflowMenuOpen(false)
                          setExportOpen(true)
                        }}
                      >
                        <Download size={16} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ color: 'var(--text-primary)' }}>Export note</span>
                      </button>
                    </>
                  )}
                  {onOpenCommandPalette && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)]"
                      onClick={() => {
                        setOverflowMenuOpen(false)
                        onOpenCommandPalette()
                      }}
                    >
                      <Command size={16} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ color: 'var(--text-primary)' }}>Command palette</span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {/* Visible entry point for reference material that otherwise has no
            link anywhere in the UI — the syntax guide page and the
            shortcuts list. */}
        <div className="relative" ref={helpMenuRef}>
          <button
            type="button"
            aria-label="Help"
            title="Help"
            className="rounded p-1.5 hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => setHelpMenuOpen((open) => !open)}
          >
            <HelpCircle size={16} />
          </button>
          <AnimatePresence>
            {helpMenuOpen && (
              <motion.div
                className="absolute top-full right-0 z-50 mt-1 w-56 rounded-md border p-1 shadow-lg"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.12 }}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)]"
                  onClick={() => {
                    setHelpMenuOpen(false)
                    navigate('/help')
                  }}
                >
                  <BookOpen size={16} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ color: 'var(--text-primary)' }}>Syntax guide</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)]"
                  onClick={() => {
                    setHelpMenuOpen(false)
                    setShortcutsOpen(true)
                  }}
                >
                  <Keyboard size={16} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ color: 'var(--text-primary)' }}>Keyboard shortcuts</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
          // Confirmed real bug from testing at narrow widths: unconditional
          // px-2.5/py-1.5 gave this button noticeably more internal padding
          // around its icon than the plain icon-only buttons elsewhere in
          // this row (p-1.5) — with the "Sign out" text hidden below sm:,
          // that extra padding made the visible icon sit further from the
          // true right edge than the hamburger icon sits from the true left
          // edge, an asymmetry visible specifically because this is the
          // last, edge-touching element in the row. p-1.5 by default now
          // matches every other icon-only button; sm:px-3 only widens once
          // the "Sign out" label actually needs the room.
          className="flex items-center gap-1.5 rounded-md border p-1.5 text-sm hover:opacity-80 sm:px-3"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          onClick={() => signOut()}
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
      {activeNoteId && (
        <>
          <RevisionsPanel fileId={activeNoteId} isOpen={revisionsOpen} onClose={() => setRevisionsOpen(false)} />
          <ExportMenu fileId={activeNoteId} isOpen={exportOpen} onClose={() => setExportOpen(false)} />
        </>
      )}
      <ShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </header>
  )
}
