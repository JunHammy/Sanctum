export interface ParsedWikilink {
  target: string
  heading: string
  blockId: string
  alias: string
}

// Shared inner-syntax parsing for `[[Target|Alias]]` / `[[Target#Heading]]` /
// `[[Target^block-id]]` — used both by the live markdown-it plugin (render
// time, plugin-wikilink.ts) and by backlink extraction (raw-text scan, no
// full render needed), kept in one place so the two never drift on what
// counts as a wikilink.
export function parseWikilinkInner(inner: string): ParsedWikilink {
  let target = inner
  let heading = ''
  let blockId = ''
  let alias = ''

  // Splits on the *first* occurrence only (indexOf/slice, not
  // String.split) — a heading-range embed's heading segment can itself
  // contain a second `#` (`Section1 to #Section2`), and split('#') would
  // silently truncate everything after the second one via destructuring.
  if (inner.includes('|')) {
    const idx = inner.indexOf('|')
    target = inner.slice(0, idx)
    alias = inner.slice(idx + 1)
  }
  if (target.includes('^')) {
    const idx = target.indexOf('^')
    blockId = target.slice(idx + 1)
    target = target.slice(0, idx)
  } else if (target.includes('#')) {
    const idx = target.indexOf('#')
    heading = target.slice(idx + 1)
    target = target.slice(0, idx)
  }

  return { target: target.trim(), heading: heading.trim(), blockId: blockId.trim(), alias: alias.trim() }
}

// Raw-text scan for `[[...]]` occurrences (skips `![[embed]]`, reserved for
// a future transclusion feature) — returns deduped target names, not yet
// resolved to file ids. Used by backlinks.service so building/updating the
// backlink map doesn't require running the note through the full markdown
// renderer just to find its outgoing links.
export function extractWikilinkTargets(content: string): string[] {
  const targets = new Set<string>()
  const regex = /(!)?\[\[([^\]]+)\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    if (match[1] === '!') continue
    const { target } = parseWikilinkInner(match[2])
    if (target) targets.add(target)
  }
  return Array.from(targets)
}
