import { Routes, Route, Navigate } from 'react-router-dom'
import { LoginRoute } from './LoginRoute'
import { VaultRoute } from './VaultRoute'
import { VaultManagerRoute } from './VaultManagerRoute'
import { HelpRoute } from './HelpRoute'
import { SettingsRoute } from './SettingsRoute'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/vaults" element={<VaultManagerRoute />} />
      <Route path="/vault" element={<VaultRoute />} />
      <Route path="/vault/note/:fileId" element={<VaultRoute />} />
      <Route path="/help" element={<HelpRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
