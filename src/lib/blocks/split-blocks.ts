import MarkdownIt from 'markdown-it'
import { RUNNABLE_LANGUAGES } from '../runnable-languages'
import { parseFenceInfo } from '../fence-info'

// Splits raw markdown into top-level block chunks using markdown-it's own
// tokenizer (no custom plugin chain needed — plugins like wikilink/callout
// are inline-level or only affect rendering, not block boundaries). Each
// block is still just a markdown substring, never converted to any other
// format — joinBlocks() is the exact inverse.
export interface Block {
  id: string
  rawText: string
  // Line this block started at in the raw markdown — shared addressing
  // scheme with Read mode's data-src-line (plugin-source-line.ts), same
  // underlying token.map[0] value either way. See scroll-to-line.ts.
  startLine: number
}

let blockIdCounter = 0
function nextId(): string {
  blockIdCounter += 1
  return `block-${blockIdCounter}-${Date.now()}`
}

const parser = new MarkdownIt()

export function splitIntoBlocks(markdown: string): Block[] {
  const tokens = parser.parse(markdown, {})
  const lines = markdown.split('\n')
  const blocks: Block[] = []

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]

    if (token.level !== 0) {
      i++
      continue
    }

    if (token.map) {
      // A ```python (or ```javascript) fence immediately followed (no
      // blank line) by its matching ```python-output/```javascript-output
      // fence is one atomic block, not two — same "merge related adjacent
      // tokens into one block" technique already used below for a whole
      // GFM table (which merges via a single container's own .map instead,
      // a different token shape but the same idea). Without this,
      // dragging/reordering/deleting a block could separate a code block
      // from the very output it produced. See runnable-languages.ts for
      // the shared list of language pairs this checks against, and
      // python-syntax.ts's/javascript-syntax.ts's own serializeXBlock for
      // the writer side of this same adjacency convention.
      const next = tokens[i + 1]
      const tokenLang = token.type === 'fence' ? parseFenceInfo(token.info).lang : null
      const isRunnableFence = tokenLang !== null && RUNNABLE_LANGUAGES.some((l) => l.lang === tokenLang)
      const nextIsAdjacentOutput =
        isRunnableFence &&
        next !== undefined &&
        next.level === 0 &&
        next.type === 'fence' &&
        next.map !== null &&
        next.map[0] === token.map[1] &&
        RUNNABLE_LANGUAGES.some((l) => l.lang === tokenLang && l.outputLang === parseFenceInfo(next.info).lang)

      if (isRunnableFence && nextIsAdjacentOutput && next.map) {
        const [startLine] = token.map
        const [, endLine] = next.map
        const rawText = lines.slice(startLine, endLine).join('\n')
        blocks.push({ id: nextId(), rawText, startLine })
        i += 2
        continue
      }

      // Either a self-contained leaf (fence, hr, html_block) or a
      // container's _open token — either way .map gives the block's full
      // [startLine, endLine) range, including all of its nested children.
      const [startLine, endLine] = token.map
      const rawText = lines.slice(startLine, endLine).join('\n')
      blocks.push({ id: nextId(), rawText, startLine })

      if (token.type.endsWith('_open')) {
        // Skip past this container's children — markdown-it's nesting
        // guarantees the next level-0 token is this container's own
        // matching _close, so no depth counter is needed.
        i++
        while (i < tokens.length && tokens[i].level !== 0) i++
        i++
        continue
      }
    }

    i++
  }

  return blocks
}

export function joinBlocks(blocks: Block[]): string {
  return blocks.map((b) => b.rawText).join('\n\n')
}

export function createEmptyBlock(): Block {
  return { id: nextId(), rawText: '', startLine: 0 }
}
