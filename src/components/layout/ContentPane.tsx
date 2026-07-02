import type { ReactNode } from 'react'

export function ContentPane({ children }: { children: ReactNode }) {
  return <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</main>
}
