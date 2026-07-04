import { useNoteStore } from '../stores/note.store'

const READ_MODE_SELECTOR = '[data-src-line]'
const EDIT_MODE_SELECTOR = '[data-line]'
const FLASH_CLASS = 'heading-flash'
const FLASH_DURATION_MS = 2000

function lineOf(el: Element): number {
  const raw = el.getAttribute('data-src-line') ?? el.getAttribute('data-line')
  return raw === null ? NaN : Number(raw)
}

// "What's currently at the top of the viewport" — used to capture a scroll
// anchor before switching Read/Edit mode.
export function findTopmostVisible(selector: string): Element | null {
  const elements = Array.from(document.querySelectorAll(selector))
  let best: Element | null = null
  let bestTop = Infinity
  for (const el of elements) {
    const top = el.getBoundingClientRect().top
    if (top >= -10 && top < bestTop) {
      best = el
      bestTop = top
    }
  }
  return best ?? elements[0] ?? null
}

// The closest block at-or-before a target line — a search match's exact
// line is usually mid-paragraph, not exactly at a block boundary, and the
// two render modes don't necessarily have a block starting at that exact
// line either.
export function findElementNearLine(selector: string, targetLine: number): Element | null {
  const elements = Array.from(document.querySelectorAll(selector))
  let best: Element | null = null
  let bestLine = -Infinity
  for (const el of elements) {
    const line = lineOf(el)
    // >= 0 excludes PropertiesPanel's permanent `-1` sentinel (it never
    // unmounts between Read/Edit, so it's always a candidate otherwise) —
    // it's a valid *scroll target* for "top of note" but shouldn't be
    // picked here as a stand-in for real content that hasn't rendered yet.
    if (line >= 0 && line <= targetLine && line > bestLine) {
      best = el
      bestLine = line
    }
  }
  return best ?? elements[0] ?? null
}

// Waits for the DOM to stop changing (no mutations for `quietMs`) before
// running `callback` — used because a note's content can go through more
// than one render before settling (observed directly: a scroll fired
// against a note whose html was transiently 313 characters instead of its
// real ~9800, because the effect that triggers this ran on an
// intermediate render, not necessarily the final one). Waiting for actual
// quiet, rather than assuming any single "content changed" signal means
// content is final, is what makes this reliable regardless of the exact
// cause of a given intermediate render.
function afterDomSettles(callback: () => void, quietMs = 120, timeoutMs = 3000) {
  const startedAt = Date.now()
  let settleTimer: ReturnType<typeof setTimeout>

  function finish() {
    observer.disconnect()
    clearTimeout(settleTimer)
    callback()
  }

  const observer = new MutationObserver(() => {
    if (Date.now() - startedAt > timeoutMs) {
      finish()
      return
    }
    clearTimeout(settleTimer)
    settleTimer = setTimeout(finish, quietMs)
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  // In case there are no further mutations at all after this point.
  settleTimer = setTimeout(finish, quietMs)
}

// Bumped on every call so an older, still-deferred (afterDomSettles) call
// can tell it's been superseded and skip acting — e.g. clicking a second
// search result before the first one's deferred scroll has fired.
let scrollGeneration = 0

// Instant scroll, *then* flash — not smooth-scroll-then-flash. A smooth
// scroll animation takes real time (often 500ms-1s+ for a long distance),
// but the flash class was being added immediately, so the highlight's
// visible window was ticking down the whole time the element was still
// scrolling into view — by the time it was actually on-screen, a chunk of
// (or the entire) highlight had already played out off-screen.
export function scrollToLineWithFlash(selector: string, line: number) {
  const myGeneration = ++scrollGeneration
  afterDomSettles(() => {
    if (myGeneration !== scrollGeneration) return
    const el = findElementNearLine(selector, line)
    if (!el) return
    el.scrollIntoView({ behavior: 'auto', block: 'center' })
    el.classList.add(FLASH_CLASS)
    setTimeout(() => el.classList.remove(FLASH_CLASS), FLASH_DURATION_MS)
  })
}

// --- Read/Edit toggle scroll preservation ---
//
// Previous design captured the anchor line, then used an external
// MutationObserver + settle-timer to *guess* from outside React when the
// other mode's content had actually mounted, before manually calling
// scrollIntoView. That fought React instead of using it: it could
// mistake PropertiesPanel's permanent scroll-anchor sentinel for "real
// content already exists," it raced Suspense/lazy-loading in ways that
// were hard to reason about, and it always painted at least one wrong
// frame before correcting itself — the visible flicker.
//
// This version stores the anchor line in note.store and lets whichever
// content component mounts next (MarkdownReader or BlockEditor) restore
// its own scroll position, via a useLayoutEffect that calls
// consumePendingScrollAnchor() below. React guarantees a component's
// layout effects run synchronously right after its DOM commits and
// *before* the browser paints — so there's no polling, no guessing, and
// nothing wrong ever gets painted in the first place.
export function toggleReadModePreservingScroll() {
  const { isReadMode, toggleReadMode, setPendingScrollAnchor } = useNoteStore.getState()
  const currentSelector = isReadMode ? READ_MODE_SELECTOR : EDIT_MODE_SELECTOR
  const anchor = findTopmostVisible(currentSelector)
  const anchorLine = anchor ? lineOf(anchor) : NaN

  setPendingScrollAnchor(Number.isNaN(anchorLine) ? null : anchorLine)
  toggleReadMode()
}

// Called from a useLayoutEffect in whichever content component just
// mounted. Safe to call unconditionally on every mount (including a
// note's very first load, or BlockEditor remounting on undo/redo) — it's
// a no-op whenever there's no pending anchor to restore.
export function consumePendingScrollAnchor(selector: string) {
  const { pendingScrollAnchor, setPendingScrollAnchor } = useNoteStore.getState()
  if (pendingScrollAnchor === null) return
  const target = findElementNearLine(selector, pendingScrollAnchor)
  target?.scrollIntoView({ behavior: 'auto', block: 'start' })
  setPendingScrollAnchor(null)
}
