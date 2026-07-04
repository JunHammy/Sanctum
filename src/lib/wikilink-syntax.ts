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

  if (inner.includes('|')) {
    const [t, a] = inner.split('|')
    target = t
    alias = a ?? ''
  }
  if (target.includes('^')) {
    const [t, b] = target.split('^')
    target = t
    blockId = b ?? ''
  } else if (target.includes('#')) {
    const [t, h] = target.split('#')
    target = t
    heading = h ?? ''
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
