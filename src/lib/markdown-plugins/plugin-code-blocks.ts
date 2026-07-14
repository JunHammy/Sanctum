import type MarkdownIt from 'markdown-it'
import { RUNNABLE_LANGUAGES } from '../runnable-languages'
import { parseFenceInfo } from '../fence-info'

// Intercepts every runnable-language fence (```python, ```javascript —
// see runnable-languages.ts) — unlike plugin-chart.ts (which fully
// replaces mermaid/plotly/chartjs fences with a placeholder), the code
// itself stays exactly as it already renders (still passed through the
// default fence renderer, so highlight.js keeps doing its normal syntax
// highlighting) — only wrapped in a container a real, interactive
// <CodeBlock> React component renders as a direct sibling of (see
// Block.tsx/MarkdownReader.tsx) rather than a portal target — portaling a
// live component into a node living inside a dangerouslySetInnerHTML
// subtree caused a real, confirmed infinite render loop earlier in this
// app's history.
//
// Only one function can ever be md.renderer.rules.fence at a time, which
// is why this handles every runnable language in one place instead of
// each language getting its own independent plugin — two plugins each
// unconditionally overwriting that same rule would mean whichever one's
// `.use()` call ran last completely clobbers the other's handling.
//
// data-src-line gives each block a stable identity that means the same
// thing in both Read mode (this attribute) and Edit mode (the containing
// Block's own id) — see sourceLinePlugin's own comment for why that shared
// addressing scheme exists; token.map[0] is read directly here rather than
// relying on token.attrGet('data-src-line') from that plugin, since this
// renderer override bypasses the default attrs-to-HTML rendering path
// entirely.
//
// An adjacent `python-output`/`javascript-output` fence (see split-
// blocks.ts's matching merge logic for the same adjacency rule) carries a
// persisted run result — python-syntax.ts's/javascript-syntax.ts's own
// serializeXBlock is what writes one. It's consumed here rather than left
// to render on its own: embedded as a `data-output` attribute on the code
// fence's own wrapper (read by split-code-segments.ts to hydrate a
// freshly-mounted <CodeBlock> without needing to re-run anything), and the
// output fence's own render is suppressed so it doesn't *also* show up as
// a second, redundant raw-JSON code block right below the real one.
export function codeBlocksPlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence!

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const { lang, blockId } = parseFenceInfo(token.info)

    const outputConfig = RUNNABLE_LANGUAGES.find((l) => l.outputLang === lang)
    if (outputConfig) {
      const prev = tokens[idx - 1]
      const isConsumedByPrecedingFence =
        prev !== undefined &&
        prev.type === 'fence' &&
        parseFenceInfo(prev.info).lang === outputConfig.lang &&
        prev.map !== null &&
        token.map !== null &&
        prev.map[1] === token.map[0]
      // An output fence with no preceding code fence to attach to (e.g. a
      // blank line was hand-inserted between them, splitting what split-
      // blocks.ts would otherwise treat as one block) — falls back to
      // rendering as an ordinary code block instead of silently vanishing.
      return isConsumedByPrecedingFence ? '' : defaultFence(tokens, idx, options, env, self)
    }

    const runnableConfig = RUNNABLE_LANGUAGES.find((l) => l.lang === lang)
    if (!runnableConfig) return defaultFence(tokens, idx, options, env, self)

    const highlighted = defaultFence(tokens, idx, options, env, self)
    const srcLine = token.map ? token.map[0] : idx

    const next = tokens[idx + 1]
    const hasAdjacentOutput =
      next !== undefined &&
      next.type === 'fence' &&
      parseFenceInfo(next.info).lang === runnableConfig.outputLang &&
      next.map !== null &&
      token.map !== null &&
      next.map[0] === token.map[1]

    let outputAttr = ''
    let srcLineEnd = token.map ? token.map[1] : srcLine
    if (hasAdjacentOutput) {
      srcLineEnd = next.map![1]
      try {
        JSON.parse(next.content.trim())
        // encodeURIComponent, not HTML-entity escaping — this is going
        // straight into an HTML attribute value, and URL-encoding sidesteps
        // hand-rolling quote/ampersand escaping for arbitrary JSON (which
        // can itself contain base64 image data). split-code-segments.ts
        // reverses it with a plain decodeURIComponent + JSON.parse.
        outputAttr = ` data-output="${encodeURIComponent(next.content.trim())}"`
      } catch {
        // Malformed persisted JSON (hand-edited/corrupted) — render the
        // code fence as if there were no persisted output at all, rather
        // than letting a broken hydration crash the whole block.
      }
    }

    // The id attribute is what lets a bare `[[Note^block-id]]` link scroll-
    // jump straight to this cell (same mechanism plugin-block-id.ts already
    // gives paragraphs/list-items), and what transclusion.ts's
    // extractSection scans raw source for when resolving a `![[Note^id]]`
    // single-cell embed.
    const idAttr = blockId ? ` id="${blockId}"` : ''

    return `<div class="${runnableConfig.blockClass}"${idAttr} data-runnable-lang="${runnableConfig.lang}" data-src-line="${srcLine}" data-src-line-end="${srcLineEnd}"${outputAttr}>${highlighted}<div class="code-run-controls"></div></div>\n`
  }
}
