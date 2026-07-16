import type { ReactNode } from 'react'
import { useSwipeTabs } from '../../hooks/useSwipeTabs'

// Centered reading column (Notion/Obsidian-style) rather than left-aligned
// content stretching to fill whatever space the sidebar leaves behind.
export function ContentPane({ children }: { children: ReactNode }) {
  const { onTouchStart, onTouchEnd } = useSwipeTabs()

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
    // pb-[50vh], not a fixed/small bottom padding — confirmed real feedback
    // from testing: a small pad only cleared the "Add block" button itself,
    // but the *page* still ran out of scroll room right at the last block,
    // leaving no way to scroll it up out of the cramped bottom edge while
    // editing it. Half the viewport gives every block, including the very
    // last one, room to scroll up into comfortable (roughly centered) view.
    <main
      className="min-w-0 flex-1 overflow-y-auto px-5 pt-6 pb-[50vh] sm:px-8"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mx-auto w-full max-w-4xl">{children}</div>
    </main>
  )
}
