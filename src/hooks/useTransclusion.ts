import { useEffect, type RefObject } from 'react'
import { resolveWikilink } from '../lib/wikilink-resolver'
import { extractSection } from '../lib/transclusion'
import { readFile } from '../services/drive.service'
import { extractFrontmatter, renderBody } from '../services/markdown.service'
import { resolveImagesIn } from './useImageResolution'
import { useVaultStore } from '../stores/vault.store'
import type { FileTreeNode } from '../types/vault.types'
import { renderStaticPythonOutput } from '../lib/python/render-static-output'
import type { PersistedCodeOutput } from '../components/editor/CodeBlock'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Guards against the same placeholder element being resolved twice
// concurrently — the hook below re-runs on every render (no dependency
// array), so a fast re-render before a previous fetch finishes would
// otherwise start a second, redundant fetch for the same still-unresolved
// element. Module-level (not per-call) since the export flow in
// export.service.ts can call resolveTransclusionsIn independently of, and
// potentially overlapping with, the hook's own runs.
const inFlight = new WeakSet<HTMLElement>()

// Caches a fully-resolved embed's rendered HTML by (target, heading,
// blockId) so a *remount* of the same placeholder — which happens far more
// often than it looks, since every Block.tsx active/inactive swap, Read/
// Edit toggle, and (since python output started persisting into the note's
// own rawBody) every single Run click all regenerate this content from
// scratch — can redisplay instantly instead of re-fetching from Drive.
// Confirmed as a real, increasingly visible glitch from testing: running a
// python block elsewhere in a note momentarily reset every already-loaded
// transclusion back to "Loading…" on the same page. Trades some freshness
// for that stability — if the *source* note being embedded changes, an
// already-cached embed won't pick that up until a full page reload clears
// this (module-level, not persisted). Same staleness trade-off this app
// already makes elsewhere (e.g. the IndexedDB content cache only refreshes
// on the next vault reindex, not on every save).
const resolvedCache = new Map<string, string>()

// A dot-joined key, not a plain-space join — a target/heading could
// plausibly contain a space itself, which would risk two genuinely
// different embeds colliding onto the same cache key. Dot is already
// disallowed in note titles/headings in practice (path-like characters
// aren't valid there), so this is a safe-enough separator without reaching
// for an escape-prone control character.
function cacheKey(target: string, heading: string | null, blockId: string | null): string {
  return [target, heading ?? '', blockId ?? ''].join('.')
}

async function resolveOnePlaceholder(el: HTMLElement, fileTree: FileTreeNode[]): Promise<void> {
  if (inFlight.has(el)) return
  inFlight.add(el)
  try {
    // Only ever replaces .transclusion-body's contents — the header link
    // (rendered by plugin-transclusion.ts, a real .wikilink anchor) stays
    // untouched across the loading → loaded swap.
    const body = el.querySelector<HTMLElement>('.transclusion-body')
    if (!body) return
    const target = el.getAttribute('data-target')
    if (!target) return
    const heading = el.getAttribute('data-heading')
    const headingEnd = el.getAttribute('data-heading-end')
    const blockId = el.getAttribute('data-block')

    const key = cacheKey(target, heading, blockId)
    const cached = resolvedCache.get(key)
    if (cached !== undefined) {
      body.innerHTML = cached
      el.classList.add('transclusion-loaded')
      resolveImagesIn(body, fileTree, useVaultStore.getState().isLoading)
      return
    }

    const fileId = resolveWikilink(target, fileTree)
    if (!fileId) {
      body.innerHTML = `<p class="transclusion-missing">Note not found: ${escapeHtml(target)}</p>`
      return
    }

    try {
      const raw = await readFile(fileId)
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
      // A transcluded runnable code block's own .code-run-controls slot
      // (plugin-code-blocks.ts) is otherwise never filled in here —
      // Block.tsx/MarkdownReader wire a live <CodeBlock> into their own
      // top-level code blocks, but this content lives inside a raw
      // innerHTML mutation with no React tree to hand a component off to.
      // Filling it with a static, read-only render of the persisted output
      // (if any) is the same read-only treatment tables/math already get
      // when transcluded, without needing a portal into this subtree —
      // see CodeBlock's own comment for why that's specifically the
      // pattern to avoid. renderStaticPythonOutput is language-agnostic
      // despite the name (just renders stdout/stderr/error/images, whatever
      // produced them) — reused as-is for javascript blocks too rather than
      // adding an identical javascript-named copy.
      body.querySelectorAll<HTMLElement>('[data-runnable-lang]').forEach((block) => {
        const controls = block.querySelector<HTMLElement>('.code-run-controls')
        if (!controls || !block.dataset.output) return
        try {
          const output = JSON.parse(decodeURIComponent(block.dataset.output)) as PersistedCodeOutput
          controls.innerHTML = renderStaticPythonOutput(output)
        } catch {
          // Malformed persisted JSON — leave the slot empty, same as a
          // block that was never run.
        }
      })
      // Cached *after* the code-block post-processing above, so a cache hit
      // (a remount of this same placeholder) redisplays the static output
      // too, not just the code.
      resolvedCache.set(key, body.innerHTML)
      el.classList.add('transclusion-loaded')
      // This injection happens outside React's render cycle entirely (a raw
      // innerHTML mutation, not a state change), so useImageResolution's own
      // per-render effect — which already ran and finished long before this
      // async fetch completed — never gets a chance to see any <img> tags in
      // this newly-added content. Resolving them here directly is what makes
      // images inside an embedded note's content actually load instead of
      // sitting broken.
      resolveImagesIn(body, fileTree, useVaultStore.getState().isLoading)
    } catch {
      body.innerHTML = `<p class="transclusion-error">Could not load "${escapeHtml(target)}"</p>`
    }
  } finally {
    inFlight.delete(el)
  }
}

// Standalone, awaitable counterpart to the hook below — used by
// export.service.ts, which (unlike the hook) needs to know when every
// embed in a note is *fully* resolved before rasterizing it for PDF export,
// not just "fetches have started."
export async function resolveTransclusionsIn(container: Element, fileTree: FileTreeNode[]): Promise<void> {
  // :not(.transclusion-loaded) is what keeps this cheap on every other
  // render the hook fires on — an already-resolved embed matches nothing,
  // instead of being silently re-fetched and re-rendered every single time.
  const placeholders = container.querySelectorAll<HTMLElement>('.transclusion[data-target]:not(.transclusion-loaded)')
  await Promise.all(Array.from(placeholders).map((el) => resolveOnePlaceholder(el, fileTree)))
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
    // Fire-and-forget, same as before the refactor — the hook itself never
    // needed to know when resolution finished, only that it started. The
    // inFlight guard above is what now prevents a fast re-render (no
    // dependency array, so this can re-run before a previous call
    // finished) from double-fetching the same still-unresolved placeholder.
    resolveTransclusionsIn(container, fileTree)
  })
}
