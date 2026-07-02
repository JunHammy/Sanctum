import type MarkdownIt from 'markdown-it'

interface WikilinkMeta {
  target: string
  heading: string
  blockId: string
  alias: string
}

// Parses [[Note]], [[Note#Heading]], [[Note^block-id]], [[Note|Alias]] into
// <a class="wikilink" data-target="..." data-heading="..." data-block="...">.
// Resolution against the file tree happens at click time (see
// lib/wikilink-resolver.ts), not here — this plugin only knows syntax.
// #heading and ^block-id are mutually exclusive suffixes, same as Obsidian.
export function wikilinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('link', 'wikilink', (state, silent) => {
    const src = state.src.slice(state.pos)

    if (src[0] !== '[' || src[1] !== '[') return false
    if (state.pos > 0 && state.src[state.pos - 1] === '!') return false // reserved for a future ![[embed]] plugin

    const closeIdx = src.indexOf(']]', 2)
    if (closeIdx === -1) return false

    if (!silent) {
      const inner = src.slice(2, closeIdx)

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

      const token = state.push('wikilink', 'a', 0)
      token.meta = {
        target: target.trim(),
        heading: heading.trim(),
        blockId: blockId.trim(),
        alias: alias.trim(),
      } satisfies WikilinkMeta
    }

    state.pos += closeIdx + 2
    return true
  })

  md.renderer.rules.wikilink = (tokens, idx) => {
    const { target, heading, blockId, alias } = tokens[idx].meta as WikilinkMeta
    const display = alias || (blockId ? `${target} > ^${blockId}` : heading ? `${target} > ${heading}` : target)
    const headingAttr = heading ? ` data-heading="${md.utils.escapeHtml(heading)}"` : ''
    const blockAttr = blockId ? ` data-block="${md.utils.escapeHtml(blockId)}"` : ''
    return `<a class="wikilink" href="#" data-target="${md.utils.escapeHtml(target)}"${headingAttr}${blockAttr}>${md.utils.escapeHtml(display)}</a>`
  }
}
