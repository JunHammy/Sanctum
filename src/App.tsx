import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { AuthGate } from './components/auth/AuthGate'
import { useTheme } from './hooks/useTheme'

function App() {
  useTheme()

  return (
    <HashRouter>
      <AuthGate>
        <AppRoutes />
      </AuthGate>
    </HashRouter>
  )
}

export default App
