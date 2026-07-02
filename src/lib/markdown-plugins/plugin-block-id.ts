import type MarkdownIt from 'markdown-it'

const BLOCK_ID_PATTERN = /\s\^([a-zA-Z0-9_-]+)\s*$/

// Marks a paragraph/list item with ^block-id at the end so [[Note^block-id]]
// has something to scroll to. Runs before 'inline' (raw content strings,
// not yet-parsed children) — same approach as the callout plugin. Every
// inline token is immediately preceded by its block's opening tag in
// markdown-it's flat token list, so tokens[i - 1] is always the right one
// to tag (paragraph_open normally, or list_item_open in a tight list).
export function blockIdPlugin(md: MarkdownIt): void {
  md.core.ruler.before('inline', 'block-id', (state) => {
    const tokens = state.tokens

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.type !== 'inline') continue

      const match = token.content.match(BLOCK_ID_PATTERN)
      if (!match) continue

      token.content = token.content.slice(0, match.index).trimEnd()
      tokens[i - 1].attrSet('id', match[1])
    }

    return true
  })
}
