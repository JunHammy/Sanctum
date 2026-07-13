import { Outlet } from 'react-router-dom'
import { useFileTree } from '../hooks/useFileTree'
import { AppShell } from '../components/layout/AppShell'

// Shared parent for every route that lives inside the vault shell (currently
// VaultRoute and HelpRoute) — a nested route with this as its `element` and
// an <Outlet/> for the child route's own content, rather than each of those
// routes independently rendering its own <AppShell>. Confirmed as a real
// bug from testing: VaultRoute and HelpRoute are different component types
// at the same <Route> slot, so react-router fully unmounted and remounted
// the whole tree — Header/Sidebar/TabBar/ContentPane included — on every
// /vault ↔ /help navigation, which visibly replayed Sidebar's mount
// animation (looked exactly like the sidebar closing and reopening) even
// though nothing about its actual open/closed state ever changed. Mounting
// AppShell once, here, means only the *inner* content swaps on navigation
// between routes that share this layout.
//
// useFileTree() also used to be called independently by both VaultRoute and
// HelpRoute — safe (idempotent, see the hook's own comment) but redundant;
// one call here is what both children's content now implicitly shares via
// AppShell's own Sidebar prop, without either of them needing to call it
// themselves anymore.
export function AppShellLayout() {
  const { fileTree, isLoading, error, refresh } = useFileTree()

  return (
    <AppShell fileTree={fileTree} isLoading={isLoading} error={error} onRefresh={refresh}>
      <Outlet />
    </AppShell>
  )
}
