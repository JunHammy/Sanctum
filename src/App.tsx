import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { AuthGate } from './components/auth/AuthGate'
import { ToastContainer } from './components/common/ToastContainer'
import { useTheme } from './hooks/useTheme'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import { useUnsavedChangesWarning } from './hooks/useUnsavedChangesWarning'

function App() {
  useTheme()
  useNetworkStatus()
  useUnsavedChangesWarning()

  return (
    <HashRouter>
      <AuthGate>
        <AppRoutes />
      </AuthGate>
      <ToastContainer />
    </HashRouter>
  )
}

export default App
