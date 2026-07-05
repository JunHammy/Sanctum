import { useEffect, useState, type ReactNode } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { ContentPane } from './ContentPane'
import { QuickSwitcher } from '../search/QuickSwitcher'
import { SearchModal } from '../search/SearchModal'
import { useKeyboardShortcut } from '../../hooks/useKeyboard'
import { loadBlockEditor } from '../../lib/prefetch-block-editor'
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

  useKeyboardShortcut('o', () => setQuickSwitcherOpen(true), { ctrl: true })
  useKeyboardShortcut('f', () => setSearchOpen(true), { ctrl: true, shift: true })

  // Starts the BlockEditor chunk fetch as early as possible — the moment
  // the vault shell mounts, in parallel with the vault-tree/note network
  // calls, instead of waiting for NoteView to mount once a specific note is
  // open. That gap mattered most right after login: with everything cold
  // (vault list, then note content, then this chunk, all sequentially) a
  // user who toggled to Edit right away could still beat the prefetch.
  // Starting it here overlaps it with those other requests instead.
  useEffect(() => {
    loadBlockEditor()
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header onOpenSearch={() => setSearchOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar nodes={fileTree} isLoading={isLoading} error={error} onRefresh={onRefresh} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TabBar />
          <ContentPane>{children}</ContentPane>
        </div>
      </div>
      <QuickSwitcher isOpen={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
