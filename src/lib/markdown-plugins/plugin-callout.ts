import type MarkdownIt from 'markdown-it'

const MARKER_PATTERN = /^\[!(\w+)\]([^\n]*)\n?/

// Parses:
//   > [!NOTE] Optional Title
//   > Body content
// into <div class="callout callout-note"><p class="callout-title">Title</p>...</div>
//
// Runs as a core rule *before* the 'inline' rule so it only ever touches raw
// inline.content strings (not yet-parsed .children arrays) — much simpler
// and less error-prone than splicing already-tokenized inline children.
export function calloutPlugin(md: MarkdownIt): void {
  md.core.ruler.before('inline', 'callout', (state) => {
    const tokens = state.tokens

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.type !== 'blockquote_open') continue

      const paraOpen = tokens[i + 1]
      const inline = tokens[i + 2]
      if (!paraOpen || paraOpen.type !== 'paragraph_open' || !inline || inline.type !== 'inline') continue

      const match = inline.content.match(MARKER_PATTERN)
      if (!match) continue

      const type = match[1].toUpperCase()
      const title = match[2].trim()

      inline.content = inline.content.slice(match[0].length)

      // Marker was the whole first line — drop the now-empty paragraph
      // rather than render a blank <p></p> before the real body.
      if (inline.content === '') {
        tokens.splice(i + 1, 3) // paragraph_open, inline, paragraph_close
      }

      token.type = 'callout_open'
      token.tag = 'div'
      token.meta = { type, title }

      let depth = 1
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_open') depth++
        if (tokens[j].type === 'blockquote_close') {
          depth--
          if (depth === 0) {
            tokens[j].type = 'callout_close'
            tokens[j].tag = 'div'
            break
          }
        }
      }
    }

    return true
  })

  md.renderer.rules.callout_open = (tokens, idx) => {
    const meta = tokens[idx].meta as { type: string; title: string }
    const typeLower = meta.type.toLowerCase()
    const label = meta.title || meta.type.charAt(0) + meta.type.slice(1).toLowerCase()
    return `<div class="callout callout-${typeLower}"><p class="callout-title">${md.utils.escapeHtml(label)}</p>\n`
  }

  md.renderer.rules.callout_close = () => '</div>\n'
}
