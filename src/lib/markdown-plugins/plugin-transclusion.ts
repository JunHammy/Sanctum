import type MarkdownIt from 'markdown-it'
import { parseWikilinkInner } from '../wikilink-syntax'

const EMBED_PATTERN = /^!\[\[([^\]]+)\]\]$/
// Optional heading-range extension: `![[Note#Section1..#Section2]]`
// embeds everything from Section1 through the end of Section2's own
// section, instead of just Section1 alone. `..` rather than a word like
// "to" — a symbol essentially never collides with real heading text,
// where a common English word could. The `#` before Section2 is what lets
// the editor's autocomplete (wikilink-autocomplete.ts) re-trigger heading
// suggestions the same way it does for the first heading — it just keys
// off "another # appeared," regardless of what precedes it. Greedy `.*`
// for the first group so a heading containing ".." itself (unlikely, but
// symmetric with the old word-based version) still splits at the last
// occurrence.
const RANGE_PATTERN = /^(.*)\.\.#(.*)$/

interface TransclusionMeta {
  target: string
  heading: string
  headingEnd: string
  blockId: string
}

// Parses a paragraph whose *entire* content is `![[Note]]` / `![[Note#Heading]]`
// / `![[Note^block-id]]` — must be on its own line, same as Obsidian (an
// embed mid-sentence isn't meaningful the way an inline image is). Actually
// fetching and rendering the target note's content is async (needs a Drive
// call), which the synchronous renderBody()/renderNote() pipeline can't do
// here — this plugin only emits a placeholder block; useTransclusion (a
// hook mirroring useImageResolution's mount-time resolution pattern) fills
// it in afterward.
export function transclusionPlugin(md: MarkdownIt): void {
  md.core.ruler.before('inline', 'transclusion', (state) => {
    const tokens = state.tokens

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.type !== 'paragraph_open') continue
      const inline = tokens[i + 1]
      if (!inline || inline.type !== 'inline') continue

      const match = EMBED_PATTERN.exec(inline.content.trim())
      if (!match) continue

      const { target, heading, blockId } = parseWikilinkInner(match[1])
      const rangeMatch = heading ? RANGE_PATTERN.exec(heading) : null
      const headingStart = rangeMatch ? rangeMatch[1].trim() : heading
      const headingEnd = rangeMatch ? rangeMatch[2].trim() : ''

      const embedToken = new state.Token('transclusion', 'div', 0)
      embedToken.meta = { target, heading: headingStart, headingEnd, blockId } satisfies TransclusionMeta
      embedToken.block = true
      // Carries the original paragraph's line-range/nesting level forward —
      // sourceLinePlugin (runs later, after 'inline') stamps data-src-line
      // from these, which the toggle/search/backlink scroll machinery in
      // scroll-to-line.ts relies on existing for every top-level block.
      embedToken.map = token.map
      embedToken.level = token.level

      // Replaces paragraph_open, inline, paragraph_close with the one token.
      tokens.splice(i, 3, embedToken)
    }

    return true
  })

  md.renderer.rules.transclusion = (tokens, idx) => {
    const token = tokens[idx]
    const { target, heading, headingEnd, blockId } = token.meta as TransclusionMeta
    const headingAttr = heading ? ` data-heading="${md.utils.escapeHtml(heading)}"` : ''
    // data-heading-end only feeds useTransclusion's own section-extraction
    // — the header link below deliberately omits it, since "jump to the
    // source" only ever means jumping to the *start* of a range, not the
    // range itself.
    const headingEndAttr = headingEnd ? ` data-heading-end="${md.utils.escapeHtml(headingEnd)}"` : ''
    const blockAttr = blockId ? ` data-block="${md.utils.escapeHtml(blockId)}"` : ''
    const headingLabel = headingEnd ? `${heading} … ${headingEnd}` : heading
    const label = blockId ? `${target} > ^${blockId}` : heading ? `${target} > ${headingLabel}` : target
    // renderAttrs pulls in whatever's on token.attrs at render time —
    // notably data-src-line, which sourceLinePlugin (runs after this rule
    // is *defined* but before it *executes*, since core rules all run
    // before the render/HTML-string phase) sets via token.attrSet(). A
    // hand-written attribute string here would have silently dropped that,
    // breaking the toggle/search/backlink scroll machinery for any note
    // whose nearest anchor happened to be a transcluded block.
    const outerAttrs = md.renderer.renderAttrs(token)
    // The header is a real .wikilink anchor (same class/data-attributes a
    // normal [[wikilink]] renders) so MarkdownReader's existing click
    // handler — already wired up via event delegation on the container —
    // handles "jump to source note" for free, no new click logic needed.
    // useTransclusion only ever replaces .transclusion-body's contents, so
    // this header survives the loading → loaded swap untouched.
    return (
      `<div class="transclusion" data-target="${md.utils.escapeHtml(target)}"${headingAttr}${headingEndAttr}${blockAttr}${outerAttrs}>` +
      `<a class="transclusion-source wikilink" href="#" data-target="${md.utils.escapeHtml(target)}"${headingAttr}${blockAttr}>${md.utils.escapeHtml(label)}</a>` +
      `<div class="transclusion-body"><p class="transclusion-loading">Loading…</p></div>` +
      `</div>\n`
    )
  }
}
