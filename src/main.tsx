import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import './styles/markdown.css'
import './styles/math-field.css'
import './styles/print.css'
import 'highlight.js/styles/atom-one-dark.css'
import 'katex/dist/katex.min.css'
import App from './App.tsx'

// Synchronous default to avoid a flash of unstyled content before React
// mounts; useTheme() then takes over and corrects it to the persisted
// preference (localStorage) once the app renders.
document.documentElement.dataset.theme = 'dark'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
