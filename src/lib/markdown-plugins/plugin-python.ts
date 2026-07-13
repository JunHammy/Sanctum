import type MarkdownIt from 'markdown-it'
import { PYTHON_LANG, PYTHON_OUTPUT_LANG } from '../python/python-syntax'

// Intercepts fenced ```python code blocks — unlike plugin-chart.ts (which
// fully replaces mermaid/plotly/chartjs fences with a placeholder), the
// code itself stays exactly as it already renders (still passed through
// the default fence renderer, so highlight.js keeps doing its normal
// syntax highlighting) — only wrapped in a container carrying an empty
// `.python-run-controls` slot for usePythonBlocks.ts to portal a real,
// interactive <PythonCodeBlock> React component into after mount. A
// Run button with live output genuinely needs React state (click
// handling, a streaming output panel, a loading spinner) — building that
// as hand-rolled imperative DOM the way the chart placeholders' "resolve
// once into a canvas" pattern does would mean reimplementing a chunk of
// React by hand for no benefit, so this uses a portal instead.
//
// data-src-line gives each python block a stable identity that means the
// same thing in both Read mode (this attribute) and Edit mode (the
// containing Block's own id) — see sourceLinePlugin's own comment for why
// that shared addressing scheme exists; token.map[0] is read directly
// here rather than relying on token.attrGet('data-src-line') from that
// plugin, since this renderer override bypasses the default
// attrs-to-HTML rendering path entirely.
//
// A ```python-output fence immediately following (see split-blocks.ts's
// matching merge logic for the same adjacency rule) carries a persisted
// run result — python-syntax.ts's serializePythonBlock is what writes one.
// It's consumed here rather than left to render on its own: embedded as a
// `data-output` attribute on the code fence's own wrapper (read by
// usePythonBlocks.tsx to hydrate a freshly-mounted <PythonCodeBlock>
// without needing to re-run anything), and the output fence's own render is
// suppressed so it doesn't *also* show up as a second, redundant raw-JSON
// code block right below the real one.
export function pythonPlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence!

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const lang = token.info.trim().toLowerCase()

    if (lang === PYTHON_OUTPUT_LANG) {
      const prev = tokens[idx - 1]
      const isConsumedByPrecedingPythonFence =
        prev !== undefined &&
        prev.type === 'fence' &&
        prev.info.trim().toLowerCase() === PYTHON_LANG &&
        prev.map !== null &&
        token.map !== null &&
        prev.map[1] === token.map[0]
      // A python-output fence with no preceding python fence to attach to
      // (e.g. a blank line was hand-inserted between them, splitting what
      // split-blocks.ts would otherwise treat as one block) — falls back to
      // rendering as an ordinary code block instead of silently vanishing.
      return isConsumedByPrecedingPythonFence ? '' : defaultFence(tokens, idx, options, env, self)
    }

    if (lang !== PYTHON_LANG) return defaultFence(tokens, idx, options, env, self)

    const highlighted = defaultFence(tokens, idx, options, env, self)
    const srcLine = token.map ? token.map[0] : idx

    const next = tokens[idx + 1]
    const hasAdjacentOutput =
      next !== undefined &&
      next.type === 'fence' &&
      next.info.trim().toLowerCase() === PYTHON_OUTPUT_LANG &&
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
        // can itself contain base64 image data). usePythonBlocks.tsx
        // reverses it with a plain decodeURIComponent + JSON.parse.
        outputAttr = ` data-output="${encodeURIComponent(next.content.trim())}"`
      } catch {
        // Malformed persisted JSON (hand-edited/corrupted) — render the
        // code fence as if there were no persisted output at all, rather
        // than letting a broken hydration crash the whole block.
      }
    }

    return `<div class="python-block" data-src-line="${srcLine}" data-src-line-end="${srcLineEnd}"${outputAttr}>${highlighted}<div class="python-run-controls"></div></div>\n`
  }
}
