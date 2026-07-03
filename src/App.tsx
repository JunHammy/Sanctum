import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { AuthGate } from './components/auth/AuthGate'
import { ToastContainer } from './components/common/ToastContainer'
import { useTheme } from './hooks/useTheme'

function App() {
  useTheme()

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
