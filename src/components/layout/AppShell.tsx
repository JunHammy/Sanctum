import { useState, type ReactNode } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { ContentPane } from './ContentPane'
import { QuickSwitcher } from '../search/QuickSwitcher'
import { SearchModal } from '../search/SearchModal'
import { useKeyboardShortcut } from '../../hooks/useKeyboard'
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

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header onOpenSearch={() => setSearchOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar nodes={fileTree} isLoading={isLoading} error={error} onRefresh={onRefresh} />
        <ContentPane>{children}</ContentPane>
      </div>
      <QuickSwitcher isOpen={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
