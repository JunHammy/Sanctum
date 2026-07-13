import { Routes, Route, Navigate } from 'react-router-dom'
import { LoginRoute } from './LoginRoute'
import { VaultRoute } from './VaultRoute'
import { VaultManagerRoute } from './VaultManagerRoute'
import { HelpRoute } from './HelpRoute'
import { SettingsRoute } from './SettingsRoute'
import { AppShellLayout } from './AppShellLayout'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/vaults" element={<VaultManagerRoute />} />
      {/* Shared AppShell (Header/Sidebar/TabBar) mounted once for every
          route nested here — see AppShellLayout's own comment for why this
          replaced each of these routes rendering its own <AppShell>. */}
      <Route element={<AppShellLayout />}>
        <Route path="/vault" element={<VaultRoute />} />
        <Route path="/vault/note/:fileId" element={<VaultRoute />} />
        <Route path="/help" element={<HelpRoute />} />
      </Route>
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
