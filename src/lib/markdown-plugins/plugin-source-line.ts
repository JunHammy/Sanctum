import type MarkdownIt from 'markdown-it'

// Stamps every top-level block token with the line it started at in the
// raw markdown source — same shape as headingIdPlugin (markdown.service.ts)
// but for *every* block, not just headings. Shared addressing scheme with
// split-blocks.ts's Block.startLine (same token.map[0] value), so a line
// number means the same thing whether the note is in Read mode (this
// plugin's data-src-line) or Edit mode (a block's startLine) — see
// scroll-to-line.ts.
export function sourceLinePlugin(md: MarkdownIt): void {
  md.core.ruler.push('source-line', (state) => {
    for (const token of state.tokens) {
      if (token.level === 0 && token.map) {
        token.attrSet('data-src-line', String(token.map[0]))
      }
    }
    return true
  })
}
