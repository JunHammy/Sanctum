import { slugify } from '../services/markdown.service'
import { parseWikilinkInner } from './wikilink-syntax'

const EMBED_PATTERN = /^!\[\[([^\]]+)\]\]$/
// Optional heading-range extension: `![[Note#Section1..#Section2]]` embeds
// everything from Section1 through the end of Section2's own section. `..`
// rather than a word like "to" — a symbol essentially never collides with
// real heading text, where a common English word could.
const RANGE_PATTERN = /^(.*)\.\.#(.*)$/

export interface ParsedEmbed {
  target: string
  heading: string
  headingEnd: string
  blockId: string
}

// Parses a line that is *entirely* `![[Target]]` / `![[Target#Heading]]` /
// `![[Target#Heading1..#Heading2]]` / `![[Target^block-id]]` — shared by
// plugin-transclusion.ts (rendering) and search.service.ts (indexing
// embedded content into the note that embeds it), so both agree on exactly
// what counts as an embed line.
export function parseEmbedLine(line: string): ParsedEmbed | null {
  const match = EMBED_PATTERN.exec(line.trim())
  if (!match) return null
  const { target, heading, blockId } = parseWikilinkInner(match[1])
  const rangeMatch = heading ? RANGE_PATTERN.exec(heading) : null
  const headingStart = rangeMatch ? rangeMatch[1].trim() : heading
  const headingEnd = rangeMatch ? rangeMatch[2].trim() : ''
  return { target, heading: headingStart, headingEnd, blockId }
}

function findHeadingLine(lines: string[], slug: string, afterIdx = -1): number {
  return lines.findIndex((line, i) => {
    if (i <= afterIdx) return false
    const match = /^(#{1,6})\s+(.*)$/.exec(line)
    return match ? slugify(match[2]) === slug : false
  })
}

function headingLevelAt(lines: string[], idx: number): number {
  return /^(#{1,6})/.exec(lines[idx])![1].length
}

// Narrows a note's body down to just the requested section for a scoped
// embed (`![[Note#Heading]]` / `![[Note#Heading..#Heading2]]` /
// `![[Note^block-id]]`) — a whole-note embed (none given) just uses the
// full body as-is, no need to call this.
export function extractSection(
  content: string,
  heading: string | null,
  blockId: string | null,
  headingEnd?: string | null,
): string | null {
  const lines = content.split('\n')

  if (blockId) {
    const pattern = new RegExp(`\\s\\^${blockId}\\s*$`)
    const idx = lines.findIndex((line) => pattern.test(line))
    if (idx === -1) return null
    // Walk back to the start of this contiguous block (the previous blank
    // line, or the top of the note) — a block-id embed means "just this
    // paragraph/list," not everything above it too.
    let start = idx
    while (start > 0 && lines[start - 1].trim() !== '') start--
    return lines.slice(start, idx + 1).join('\n')
  }

  if (heading) {
    const startIdx = findHeadingLine(lines, slugify(heading))
    if (startIdx === -1) return null
    const startLevel = headingLevelAt(lines, startIdx)

    // For a plain single-heading embed, the section's own boundary is
    // its own level. For a range (`Section1..#Section2`), the relevant
    // boundary is Section2's level instead — "run through the end of
    // whatever Section2 itself covers," not stop the instant Section2's
    // own content ends.
    let boundaryIdx = startIdx
    let boundaryLevel = startLevel
    if (headingEnd) {
      const endIdx = findHeadingLine(lines, slugify(headingEnd), startIdx)
      if (endIdx === -1) return null // end heading not found — fail rather than silently embedding just the start section
      boundaryIdx = endIdx
      boundaryLevel = headingLevelAt(lines, endIdx)
    }

    let endBoundary = lines.length
    for (let i = boundaryIdx + 1; i < lines.length; i++) {
      const match = /^(#{1,6})\s+/.exec(lines[i])
      if (match && match[1].length <= boundaryLevel) {
        endBoundary = i
        break
      }
    }
    return lines.slice(startIdx, endBoundary).join('\n')
  }

  return null
}
