import { useEffect, type RefObject } from 'react'
import { findAttachmentByName } from '../lib/image-resolver'
import { readFileBlob } from '../services/drive.service'
import type { FileTreeNode } from '../types/vault.types'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Resolves a vault-relative audio/PDF src (plugin-media-embed.ts leaves
// these as data-relative-src, not a real src, for exactly this reason —
// same pattern as useImageResolution) to a Drive blob URL. Kept separate
// from that hook rather than generalizing it to cover <audio>/<iframe> too
// — its spinner/failed-state visual treatment is genuinely image-specific
// (swap the element for a spinner in place), which doesn't translate to
// "replace an audio player" the same way.
export function useMediaEmbeds(containerRef: RefObject<HTMLDivElement | null>, fileTree: FileTreeNode[]) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // :not(.media-loaded) keeps this cheap on every other render — no
    // dependency array, same reasoning as every other hook here (Block.tsx/
    // NoteView's Read-Edit toggle both remount this content from scratch,
    // so a fresh unresolved placeholder can reappear without any prop
    // actually changing).
    const elements = container.querySelectorAll<HTMLElement>('[data-relative-src]:not(.media-loaded)')
    elements.forEach(async (el) => {
      const relativeSrc = el.getAttribute('data-relative-src')
      if (!relativeSrc) return
      el.classList.add('media-loaded')

      const filename = relativeSrc.split('/').pop()
      const fileId = filename ? findAttachmentByName(fileTree, filename) : null
      if (!fileId) {
        el.outerHTML = `<p class="media-embed-missing">Media not found: ${escapeHtml(relativeSrc)}</p>`
        return
      }

      try {
        const blob = await readFileBlob(fileId)
        el.setAttribute('src', URL.createObjectURL(blob))
        el.removeAttribute('data-relative-src')
      } catch {
        el.outerHTML = `<p class="media-embed-missing">Could not load: ${escapeHtml(relativeSrc)}</p>`
      }
    })
  })
}
