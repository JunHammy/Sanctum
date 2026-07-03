import type { ReactNode } from 'react'

// Centered reading column (Notion/Obsidian-style) rather than left-aligned
// content stretching to fill whatever space the sidebar leaves behind.
export function ContentPane({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-4xl">{children}</div>
    </main>
  )
}
