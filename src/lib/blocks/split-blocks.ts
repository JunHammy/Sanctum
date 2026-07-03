import MarkdownIt from 'markdown-it'

// Splits raw markdown into top-level block chunks using markdown-it's own
// tokenizer (no custom plugin chain needed — plugins like wikilink/callout
// are inline-level or only affect rendering, not block boundaries). Each
// block is still just a markdown substring, never converted to any other
// format — joinBlocks() is the exact inverse.
export interface Block {
  id: string
  rawText: string
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
      // Either a self-contained leaf (fence, hr, html_block) or a
      // container's _open token — either way .map gives the block's full
      // [startLine, endLine) range, including all of its nested children.
      const [startLine, endLine] = token.map
      const rawText = lines.slice(startLine, endLine).join('\n')
      blocks.push({ id: nextId(), rawText })

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
  return { id: nextId(), rawText: '' }
}
