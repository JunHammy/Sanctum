import { useEffect, type RefObject } from 'react'
import { resolveWikilink } from '../lib/wikilink-resolver'
import { extractSection } from '../lib/transclusion'
import { readFile } from '../services/drive.service'
import { extractFrontmatter, renderBody } from '../services/markdown.service'
import { resolveImagesIn } from './useImageResolution'
import { useVaultStore } from '../stores/vault.store'
import type { FileTreeNode } from '../types/vault.types'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Fills in the placeholder plugin-transclusion.ts emits for `![[Note]]` —
// same reasoning as useImageResolution: renderBody()/renderNote() stay
// synchronous, so the actual fetch+render for an embedded note's content
// has to happen after mount instead. Also mirrors useImageResolution's
// no-dependency-array design, and for the same reason: both Block.tsx's
// active/inactive swap *and* NoteView's Read/Edit toggle unmount and
// remount this content's container from scratch (they're different
// branches of a ternary, not the same element persisting) — so a fresh,
// unresolved placeholder can appear again with the same `html` value as
// before, which a dependency array would miss entirely.
export function useTransclusion(containerRef: RefObject<HTMLDivElement | null>, fileTree: FileTreeNode[]) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false

    // :not(.transclusion-loaded) is what keeps this cheap on every other
    // render this fires on — an already-resolved embed is skipped instead
    // of being silently re-fetched and re-rendered every single time.
    const placeholders = container.querySelectorAll<HTMLElement>('.transclusion[data-target]:not(.transclusion-loaded)')
    placeholders.forEach(async (el) => {
      // Only ever replaces .transclusion-body's contents — the header
      // link (rendered by plugin-transclusion.ts, a real .wikilink anchor)
      // stays untouched across the loading → loaded swap.
      const body = el.querySelector<HTMLElement>('.transclusion-body')
      if (!body) return
      const target = el.getAttribute('data-target')
      if (!target) return
      const heading = el.getAttribute('data-heading')
      const headingEnd = el.getAttribute('data-heading-end')
      const blockId = el.getAttribute('data-block')

      const fileId = resolveWikilink(target, fileTree)
      if (!fileId) {
        body.innerHTML = `<p class="transclusion-missing">Note not found: ${escapeHtml(target)}</p>`
        return
      }

      try {
        const raw = await readFile(fileId)
        if (cancelled) return
        const { content } = extractFrontmatter(raw)
        const section = heading || blockId ? extractSection(content, heading, blockId, headingEnd) : content
        if (section === null) {
          body.innerHTML = `<p class="transclusion-missing">Section not found in "${escapeHtml(target)}"</p>`
          return
        }
        // Neutralizes any nested ![[...]] into a plain [[...]] link rather
        // than expanding it too — without this, two notes embedding each
        // other would recursively fetch/render forever. A plain link is
        // still one click away, just not auto-expanded.
        const safeSection = section.replace(/!\[\[/g, '[[')
        body.innerHTML = renderBody(safeSection)
        el.classList.add('transclusion-loaded')
        // This injection happens outside React's render cycle entirely
        // (a raw innerHTML mutation, not a state change), so useImageResolution's
        // own per-render effect — which already ran and finished long
        // before this async fetch completed — never gets a chance to see
        // any <img> tags in this newly-added content. Resolving them here
        // directly is what makes images inside an embedded note's content
        // actually load instead of sitting broken.
        resolveImagesIn(body, fileTree, useVaultStore.getState().isLoading)
      } catch {
        if (!cancelled) body.innerHTML = `<p class="transclusion-error">Could not load "${escapeHtml(target)}"</p>`
      }
    })

    return () => {
      cancelled = true
    }
    // Deliberately no dependency array — see the comment above. Cheap to
    // run unconditionally: the :not(.transclusion-loaded) selector means
    // an already-resolved embed matches nothing on every render after its
    // first, so there's no repeat work for it to do.
  })
}
