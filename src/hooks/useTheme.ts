import { useEffect } from 'react'
import { useUIStore } from '../stores/ui.store'

export function useTheme() {
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return { theme, toggleTheme }
}
