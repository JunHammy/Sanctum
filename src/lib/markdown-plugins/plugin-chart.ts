import type MarkdownIt from 'markdown-it'

const CHART_LANGS = new Set(['mermaid', 'plotly', 'chartjs'])

// Intercepts fenced code blocks tagged mermaid/plotly/chartjs and emits a
// placeholder instead of a syntax-highlighted code block — actually
// rendering any of the three needs a dynamically-imported library
// (useCharts.ts, mirroring the same "sync placeholder, async resolve
// after mount" pattern as images/transclusion), which the synchronous
// renderBody()/renderNote() pipeline can't do here. Every other fenced
// language (python, typescript, ...) falls through to markdown-it's own
// default fence renderer (captured below, before being overridden) so
// highlight.js keeps handling those exactly as before.
export function chartPlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence!

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const lang = token.info.trim().toLowerCase()
    if (!CHART_LANGS.has(lang)) return defaultFence(tokens, idx, options, env, self)

    const source = md.utils.escapeHtml(token.content)
    // Chart.js draws onto a <canvas>, not a <div> — the placeholder
    // includes one up front so useCharts.ts always has a real canvas
    // element to construct its Chart instance against.
    const inner = lang === 'chartjs' ? '<canvas></canvas>' : ''
    return `<div class="chart-${lang}" data-chart-source="${source}">${inner}</div>\n`
  }
}
