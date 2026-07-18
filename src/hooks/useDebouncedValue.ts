import { useEffect, useState } from 'react'

// Delays propagating a fast-changing value (e.g. a chart/diagram spec
// updated on every keystroke) until it's held still for `delayMs` — used to
// keep an expensive downstream re-render (Chart.js/Plotly/Mermaid, all
// real library work, not just a cheap re-paint) from firing on every single
// character typed. The UI bound to the *undebounced* value (the data grid
// itself) still updates instantly; only the expensive consumer sees the
// delayed version.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
