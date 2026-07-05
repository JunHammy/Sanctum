import type MarkdownIt from 'markdown-it'
import { TAG_CHARS_PATTERN } from '../tag-syntax'

// Parses inline #tag tokens. Only triggers at the start of a line or after
// whitespace, so it doesn't fire on things like markdown-it-footnote's
// internal markers or a stray "#" mid-word.
export function tagPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('emphasis', 'tag', (state, silent) => {
    const start = state.pos
    if (state.src[start] !== '#') return false

    const prevChar = start > 0 ? state.src[start - 1] : ' '
    if (!/\s/.test(prevChar)) return false

    const match = state.src.slice(start).match(TAG_CHARS_PATTERN)
    if (!match) return false

    if (!silent) {
      const token = state.push('tag', 'span', 0)
      token.content = match[1]
    }

    state.pos += match[0].length
    return true
  })

  md.renderer.rules.tag = (tokens, idx) => `<span class="tag">#${md.utils.escapeHtml(tokens[idx].content)}</span>`
}
