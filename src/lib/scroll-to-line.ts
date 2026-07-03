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
    if (!Number.isNaN(line) && line <= targetLine && line > bestLine) {
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

// Bumped whenever a new toggle starts, so an older toggle's still-pending
// restore (e.g. one still waiting on afterDomSettles) can tell it's been
// superseded and bail instead of firing late — rapid repeated toggling
// was stacking up multiple delayed restores that fired out of order,
// which is what made it feel like it was glitching *more*, not less.
let toggleGeneration = 0

// Toggling Read/Edit swaps the whole content DOM (a continuous rendered
// blob vs. a list of CodeMirror instances), and the two don't produce
// identical block heights — without this, the page visibly jumps on every
// toggle even though nothing the user asked to move actually did.
export function toggleReadModePreservingScroll() {
  const myGeneration = ++toggleGeneration
  const { isReadMode, toggleReadMode } = useNoteStore.getState()
  const currentSelector = isReadMode ? READ_MODE_SELECTOR : EDIT_MODE_SELECTOR
  const nextSelector = isReadMode ? EDIT_MODE_SELECTOR : READ_MODE_SELECTOR

  const anchor = findTopmostVisible(currentSelector)
  const anchorLine = anchor ? lineOf(anchor) : NaN

  toggleReadMode()

  if (Number.isNaN(anchorLine)) return

  function restore() {
    if (myGeneration !== toggleGeneration) return // a later toggle already took over
    const target = findElementNearLine(nextSelector, anchorLine)
    target?.scrollIntoView({ behavior: 'auto', block: 'start' })
  }

  if (document.querySelector(nextSelector)) {
    // Fast path — content already exists (the common case, every toggle
    // after the first), just needs one frame for React to finish
    // committing this toggle's render. No artificial settle delay here;
    // that's what was making every toggle feel sluggish.
    requestAnimationFrame(restore)
    return
  }

  // Slow path — content doesn't exist yet at all. Only happens switching
  // *into* Edit mode for the very first time: BlockEditor is lazy-loaded
  // (a separate JS chunk), so there's a real Suspense/network wait before
  // its content exists. Watch for it to actually appear, then let it
  // settle before restoring, rather than guessing at a delay.
  const observer = new MutationObserver(() => {
    if (document.querySelector(nextSelector)) {
      observer.disconnect()
      afterDomSettles(restore)
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  // Safety net — if the target content never shows up for some reason,
  // don't leave an observer running on the page forever.
  setTimeout(() => observer.disconnect(), 5000)
}
