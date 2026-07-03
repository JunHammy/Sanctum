import { useEffect } from 'react'
import { findAttachmentByName, isRelativeImagePath } from '../lib/image-resolver'
import { readFileBlob } from '../services/drive.service'
import type { FileTreeNode } from '../types/vault.types'

const SPINNER_CLASS = 'sanctum-image-spinner'
const FAILED_CLASS = 'sanctum-image-failed'

// Module-level, not per-hook-instance: Read/Edit mode swap (and re-entering
// a block) remounts the DOM this hook operates on, which previously meant
// re-fetching and re-object-URL'ing the same attachment from scratch every
// time — a visible flash for something that hadn't actually changed. Once
// resolved, a fileId's blob URL lives for the rest of the page session
// (revoking on every unmount would defeat the point of caching it); the
// browser reclaims it on navigation/tab close, fine at personal-vault scale.
const resolvedUrlCache = new Map<string, string>()
const inFlightFetches = new Map<string, Promise<string>>()

function resolveImageUrl(fileId: string): Promise<string> {
  let promise = inFlightFetches.get(fileId)
  if (!promise) {
    promise = readFileBlob(fileId).then((blob) => {
      const url = URL.createObjectURL(blob)
      resolvedUrlCache.set(fileId, url)
      return url
    })
    inFlightFetches.set(fileId, promise)
    promise.catch(() => inFlightFetches.delete(fileId)) // allow retrying a genuine failure later
  }
  return promise
}

function clearPlaceholder(img: HTMLImageElement) {
  const sibling = img.nextElementSibling
  if (sibling?.classList.contains(SPINNER_CLASS) || sibling?.classList.contains(FAILED_CLASS)) {
    sibling.remove()
  }
}

function showSpinner(img: HTMLImageElement) {
  if (img.nextElementSibling?.classList.contains(SPINNER_CLASS)) return // already showing one
  clearPlaceholder(img)
  img.style.display = 'none'
  const spinner = document.createElement('span')
  spinner.className = `${SPINNER_CLASS} inline-block animate-spin rounded-full border-2`
  spinner.style.width = '1.1em'
  spinner.style.height = '1.1em'
  spinner.style.borderColor = 'var(--border)'
  spinner.style.borderTopColor = 'var(--accent-link)'
  img.insertAdjacentElement('afterend', spinner)
}

function showFailed(img: HTMLImageElement, message: string) {
  clearPlaceholder(img)
  img.style.display = 'none'
  const note = document.createElement('span')
  note.className = `${FAILED_CLASS} text-xs italic`
  note.style.color = 'var(--error)'
  note.textContent = message
  img.insertAdjacentElement('afterend', note)
}

function showResolved(img: HTMLImageElement, url: string) {
  clearPlaceholder(img)
  img.src = url
  img.style.display = ''
}

// Vault images are relative paths in the rendered HTML (![](assets/x.png))
// — resolve them to Drive blob URLs after mount, since it requires network
// calls that renderNote()/renderBody() themselves stay synchronous and free
// of. Shared by MarkdownReader (whole-document read mode) and Block (a
// single block's inactive/rendered state in the block editor).
export function useImageResolution(
  containerRef: React.RefObject<HTMLDivElement | null>,
  fileTree: FileTreeNode[],
  isVaultLoading: boolean,
) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // StrictMode runs effects twice in dev (mount, cleanup, mount again);
    // this guard stops a stale first-pass fetch from writing into a DOM
    // node after this run's already been torn down.
    let cancelled = false
    const images = container.querySelectorAll('img')

    images.forEach((img) => {
      const src = img.getAttribute('src')
      if (!src || !isRelativeImagePath(src)) return

      const filename = src.split('/').pop()
      if (!filename) return

      if (isVaultLoading) {
        // Don't decide "not found" off a vault tree that hasn't finished
        // its initial load yet — on a hard page refresh, the note's own
        // content often arrives before the full vault file listing does,
        // which is what previously made an image need a manual sidebar
        // refresh to ever show up. Show a spinner and let the effect's
        // fileTree dependency re-run this once loading finishes.
        showSpinner(img)
        return
      }

      const fileId = findAttachmentByName(fileTree, filename)
      if (!fileId) {
        showFailed(img, `Image not found in vault: ${filename}`)
        return
      }

      const cachedUrl = resolvedUrlCache.get(fileId)
      if (cachedUrl) {
        showResolved(img, cachedUrl) // synchronous — no spinner flash for an already-loaded image
        return
      }

      showSpinner(img)
      resolveImageUrl(fileId)
        .then((url) => {
          if (cancelled) return
          showResolved(img, url)
        })
        .catch(() => {
          if (cancelled) return
          showFailed(img, `Failed to load image: ${filename}`)
        })
    })

    return () => {
      cancelled = true
    }
    // Deliberately no dependency array — runs after every render instead.
    // `containerRef` never changes identity, but the DOM node it *points
    // to* can: Block.tsx swaps between <MarkdownEditor> (active) and this
    // dangerouslySetInnerHTML div (inactive) on every activate/deactivate,
    // which recreates the <img> nodes without `html`/`fileTree` changing at
    // all — a dependency array here would silently skip re-resolving them.
    // Cheap to run unconditionally: already-resolved images short-circuit
    // immediately (their src is a blob: URL, which fails the relative-path
    // check below before any lookup happens).
  })
}
