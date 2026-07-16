import type { TouchEvent } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useTabsStore, HELP_TAB_ID } from '../stores/tabs.store'
import { useVaultStore } from '../stores/vault.store'
import { tabPath } from '../lib/tab-path'
import { useSwipeGesture } from './useSwipeGesture'
import { useIsTouchDevice } from './useIsTouchDevice'

// Elements with their own horizontal touch interaction — a wide table's
// native scroll, a CodeMirror editor's text-selection drag, a MathLive
// field, or a plain link — must keep that interaction to themselves rather
// than also being reinterpreted as "switch tabs." Mirrors the same kind of
// bail-out useDragScrollTables.ts already uses for its own mouse-drag
// version of this problem (there: textarea/input; here: touch-specific).
const SWIPE_EXCLUDED_SELECTOR = '.table-scroll, .cm-editor, math-field, textarea, input, a'

// Swipe left/right anywhere on a note's content to move to the next/
// previous open tab — mobile-browser-tab-switching convention. Touch only
// (useIsTouchDevice, same convention every other touch-specific affordance
// in this app already follows) and no-op below two open tabs. Deliberately
// doesn't wrap around at the ends (swiping past the last tab does nothing,
// rather than cycling back to the first) — matches how a physical stack of
// tabs behaves, not a carousel.
export function useSwipeTabs() {
  const isTouch = useIsTouchDevice()
  const openFileIds = useTabsStore((s) => s.openFileIds)
  const fileTree = useVaultStore((s) => s.fileTree)
  const navigate = useNavigate()
  const { fileId: activeFileId } = useParams<{ fileId?: string }>()
  const { pathname } = useLocation()

  function currentIndex(): number {
    return openFileIds.findIndex((id) => (id === HELP_TAB_ID ? pathname === '/help' : id === activeFileId))
  }

  function goToOffset(offset: number) {
    if (openFileIds.length < 2) return
    const index = currentIndex()
    if (index === -1) return
    const next = openFileIds[index + offset]
    if (next) navigate(tabPath(next, fileTree))
  }

  const { onTouchStart: onSwipeTouchStart, onTouchEnd } = useSwipeGesture({
    onSwipeLeft: () => goToOffset(1),
    onSwipeRight: () => goToOffset(-1),
  })

  function onTouchStart(e: TouchEvent) {
    if (!isTouch) return
    if ((e.target as HTMLElement).closest(SWIPE_EXCLUDED_SELECTOR)) return
    onSwipeTouchStart(e)
  }

  return { onTouchStart, onTouchEnd }
}
