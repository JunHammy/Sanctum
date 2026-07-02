import { HashRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { AuthGate } from './components/auth/AuthGate'

function App() {
  return (
    <HashRouter>
      <AuthGate>
        <AppRoutes />
      </AuthGate>
    </HashRouter>
  )
}

export default App
