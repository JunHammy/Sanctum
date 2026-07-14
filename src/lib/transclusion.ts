import { slugify } from '../services/markdown.service'
import { parseWikilinkInner } from './wikilink-syntax'
import { parseFenceInfo } from './fence-info'
import { RUNNABLE_LANGUAGES } from './runnable-languages'

const EMBED_PATTERN = /^!\[\[([^\]]+)\]\]$/
// A fence's opening line — used to tell a `^block-id` match on a fence's
// opening line (e.g. ` ```python ^my-id `) apart from one trailing a plain
// paragraph/list-item, since the two need genuinely different extraction
// logic (see extractFenceBlock below).
const FENCE_OPEN_PATTERN = /^(`{3,})/
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

// First line at or after openIdx+1 consisting only of `marker`-or-more
// backticks (and optional trailing whitespace) — mirrors CommonMark/
// markdown-it's own fence-closing rule (first qualifying line wins, however
// unusual that is for a fence whose *content* happens to contain a
// bare-backticks line — the real renderer has that same behavior, this
// isn't a new edge case).
function findFenceClose(lines: string[], openIdx: number, marker: string): number {
  const closePattern = new RegExp(`^${marker}+\\s*$`)
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (closePattern.test(lines[i])) return i
  }
  return -1
}

// A `^block-id` on a fence's opening line means "just this cell" — the code
// fence through its own closing fence, plus (when present, with zero blank
// lines between) its paired `-output` fence through *its* closing fence too,
// matching the exact adjacency convention plugin-code-blocks.ts/
// split-blocks.ts already use when pairing a runnable fence with its output.
function extractFenceBlock(lines: string[], openIdx: number, marker: string): string | null {
  const closeIdx = findFenceClose(lines, openIdx, marker)
  if (closeIdx === -1) return null

  const codeLang = parseFenceInfo(lines[openIdx].slice(marker.length)).lang
  const outputLang = RUNNABLE_LANGUAGES.find((l) => l.lang === codeLang)?.outputLang
  const nextLine = lines[closeIdx + 1]
  const nextOpen = outputLang && nextLine !== undefined ? FENCE_OPEN_PATTERN.exec(nextLine) : null

  if (nextOpen && parseFenceInfo(nextLine.slice(nextOpen[1].length)).lang === outputLang) {
    const outputCloseIdx = findFenceClose(lines, closeIdx + 1, nextOpen[1])
    if (outputCloseIdx !== -1) return lines.slice(openIdx, outputCloseIdx + 1).join('\n')
  }

  return lines.slice(openIdx, closeIdx + 1).join('\n')
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

    // A ```python ^block-id fence's opening line also ends in ` ^block-id`,
    // so it's already found by the same scan above — what differs is how
    // far the block extends from here (through its own closing fence, and
    // possibly a paired output fence too, not just this one line).
    const fenceMatch = FENCE_OPEN_PATTERN.exec(lines[idx])
    if (fenceMatch) return extractFenceBlock(lines, idx, fenceMatch[1])

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
