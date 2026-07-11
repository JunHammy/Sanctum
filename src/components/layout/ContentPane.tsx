import type { ReactNode } from 'react'

// Centered reading column (Notion/Obsidian-style) rather than left-aligned
// content stretching to fill whatever space the sidebar leaves behind.
export function ContentPane({ children }: { children: ReactNode }) {
  return (
    // min-w-0 matters here, not cosmetically: this is a flex item (row
    // sibling of Sidebar in AppShell), and a flex item's automatic minimum
    // width defaults to its content's min-content size on any axis where
    // its own overflow is `visible` — only overflow-y is set here, so
    // without this, a wide child (e.g. a many-column table) makes `main`
    // itself refuse to shrink, growing past its flex allocation and
    // dragging the *entire page* (sidebar included) into horizontal
    // scroll — confirmed via testing, this is what actually caused a
    // wide table to overflow the whole app rather than scrolling within
    // its own bounds like it was supposed to.
    <main className="min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-4xl">{children}</div>
    </main>
  )
}
