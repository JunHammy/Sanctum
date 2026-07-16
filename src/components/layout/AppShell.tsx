import { useEffect, useState, type ReactNode } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { ContentPane } from './ContentPane'
import { QuickSwitcher } from '../search/QuickSwitcher'
import { SearchModal } from '../search/SearchModal'
import { CommandPalette } from '../common/CommandPalette'
import { useKeyboardShortcut } from '../../hooks/useKeyboard'
import { loadBlockEditor } from '../../lib/prefetch-block-editor'
import { loadKatex } from '../../lib/prefetch-katex'
import { useNoteStore } from '../../stores/note.store'
import { renderBody } from '../../services/markdown.service'
import type { FileTreeNode } from '../../types/vault.types'

interface AppShellProps {
  fileTree: FileTreeNode[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  children: ReactNode
}

// Quick switcher and search need to work from anywhere in the vault, not
// just while a note is open — their shortcuts and modal state live here
// (always mounted while signed in), not in NoteView.
export function AppShell({ fileTree, isLoading, error, onRefresh, children }: AppShellProps) {
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // No edge-swipe-to-open here (deliberately dropped, not an oversight) —
  // a rightward swipe starting at the left edge is iOS Safari's own native
  // back-navigation gesture. Fighting a system-level gesture recognizer
  // with preventDefault is unreliable (Safari can still half-trigger its
  // own back animation) and, worse, silently steals real "go back" intent
  // from the user whenever it does work. Swipe-to-close (Sidebar.tsx) is
  // the opposite direction and not edge-anchored, so it doesn't have this
  // problem and stays; opening is the hamburger button only.

  useKeyboardShortcut('o', () => setQuickSwitcherOpen(true), { ctrl: true })
  useKeyboardShortcut('f', () => setSearchOpen(true), { ctrl: true, shift: true })
  // Plain Ctrl+K is reserved by Chrome (focuses the address bar with a
  // search prompt) — pages can technically override it while focus is
  // inside the page, but it's too strong and widely-shared a muscle-memory
  // shortcut to fight. Ctrl+Shift+K avoids the conflict entirely and
  // matches this app's own convention of Shift for secondary actions
  // (Search is already Ctrl+Shift+F).
  useKeyboardShortcut('k', () => setCommandPaletteOpen(true), { ctrl: true, shift: true })

  // Starts the BlockEditor chunk fetch as early as possible — the moment
  // the vault shell mounts, in parallel with the vault-tree/note network
  // calls, instead of waiting for NoteView to mount once a specific note is
  // open. That gap mattered most right after login: with everything cold
  // (vault list, then note content, then this chunk, all sequentially) a
  // user who toggled to Edit right away could still beat the prefetch.
  // Starting it here overlaps it with those other requests instead.
  //
  // loadKatex() gets the same early start, for the same reason — by the
  // time any note's math actually needs rendering, katex has very likely
  // already arrived. katex-setup.ts's renderTex stays fully synchronous and
  // just falls back to the original raw $-delimited text if it hasn't — the
  // .then() here covers the one case that fallback can't fix on its own:
  // a note already open and rendered *before* katex finished loading. Every
  // other render path (Block.tsx's per-block preview, most visibly) already
  // recomputes on its own next render regardless, so needs no equivalent
  // patch here.
  useEffect(() => {
    loadBlockEditor()
    loadKatex().then(() => {
      const { activeNoteId, rawBody } = useNoteStore.getState()
      if (activeNoteId) useNoteStore.setState({ html: renderBody(rawBody) })
    })
  }, [])

  return (
    // h-dvh, not h-screen (100vh) — confirmed real bug via mobile testing:
    // 100vh on iOS Safari is fixed to the *largest* possible viewport (as if
    // the URL bar were already collapsed), so with html/body locked to
    // overflow:hidden (see globals.css), any time the actual visible area
    // was smaller than that — the URL bar showing, or especially the
    // on-screen keyboard opening while editing a block — the fixed-height
    // shell no longer matched the real viewport. iOS additionally tries to
    // pan the page to keep a focused input above the keyboard, which shifted
    // the *whole* shell (Header included) out of view with no way to
    // scroll back to it, since overflow:hidden blocks exactly that. dvh
    // tracks the actual live viewport instead of a static worst-case
    // assumption, so the shell now genuinely shrinks to fit (keyboard,
    // URL bar, or otherwise) rather than needing the browser to pan around
    // a shell that no longer fits.
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header onOpenSearch={() => setSearchOpen(true)} onOpenCommandPalette={() => setCommandPaletteOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar nodes={fileTree} isLoading={isLoading} error={error} onRefresh={onRefresh} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TabBar />
          <ContentPane>{children}</ContentPane>
        </div>
      </div>
      <QuickSwitcher isOpen={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
      />
    </div>
  )
}
