import type { ReactNode } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { ContentPane } from './ContentPane'
import type { FileTreeNode } from '../../types/vault.types'

interface AppShellProps {
  fileTree: FileTreeNode[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  children: ReactNode
}

export function AppShell({ fileTree, isLoading, error, onRefresh, children }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar nodes={fileTree} isLoading={isLoading} error={error} onRefresh={onRefresh} />
        <ContentPane>{children}</ContentPane>
      </div>
    </div>
  )
}
