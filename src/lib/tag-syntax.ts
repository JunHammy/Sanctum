// Shared with plugin-tag.ts's inline #tag markdown-it rule — this is the
// same "starts with # then tag characters" pattern, used here for a
// raw-text scan (tags.service.ts, building the vault-wide tag index)
// instead of during a live render.
export const TAG_CHARS_PATTERN = /^#([a-zA-Z0-9_-]+)/

// Same trigger condition as the live plugin: a `#` only counts at the very
// start of a line or right after whitespace, so this doesn't pick up a
// heading marker (`# Heading` — a space follows immediately, which isn't a
// tag character) or a stray `#` mid-word.
export function extractInlineTags(content: string): string[] {
  const tags = new Set<string>()
  for (const line of content.split('\n')) {
    let searchFrom = 0
    while (searchFrom < line.length) {
      const hashIdx = line.indexOf('#', searchFrom)
      if (hashIdx === -1) break
      const prevChar = hashIdx > 0 ? line[hashIdx - 1] : ' '
      if (/\s/.test(prevChar)) {
        const match = TAG_CHARS_PATTERN.exec(line.slice(hashIdx))
        if (match) tags.add(match[1])
      }
      searchFrom = hashIdx + 1
    }
  }
  return Array.from(tags)
}
