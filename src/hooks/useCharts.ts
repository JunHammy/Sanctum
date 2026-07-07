import { useEffect, type RefObject } from 'react'
import { useUIStore } from '../stores/ui.store'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function renderMermaid(el: HTMLElement, source: string, isDark: boolean): Promise<void> {
  try {
    const { default: mermaid } = await import('mermaid')
    // Re-initialize on every render rather than once globally — mermaid
    // has no per-call theme override, only this global config, and the
    // note's current theme (light/dark) isn't known until render time.
    // A diagram renders with whatever theme was active at mount — toggling
    // the app's theme afterward doesn't live-update an already-rendered
    // diagram, an accepted gap (same class of tradeoff as several other
    // hooks in this codebase that don't re-run on every possible state
    // change, just the ones that matter for a fresh mount).
    mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' })
    // A random id, not a stable one — mermaid.render errors if asked to
    // reuse an id already present in the DOM, which a stable per-position
    // id could collide with across multiple charts in the same note.
    const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
    const { svg } = await mermaid.render(id, source)
    el.innerHTML = svg
  } catch (err) {
    el.innerHTML = `<p class="chart-error">Could not render diagram: ${escapeHtml(errorMessage(err))}</p>`
  }
}

let chartjsRegistered = false

async function renderChartjs(el: HTMLElement, source: string): Promise<void> {
  const canvas = el.querySelector('canvas')
  if (!canvas) return
  try {
    const config = JSON.parse(source)
    const { Chart, registerables } = await import('chart.js')
    // Registering every controller/scale/element type rather than hand-
    // picking based on the note's own JSON `type` — simpler, and the cost
    // (a few dozen classes) is negligible next to Chart.js's own baseline
    // bundle weight. Guarded so re-rendering a second chart block in the
    // same note doesn't needlessly re-register on every one.
    if (!chartjsRegistered) {
      Chart.register(...registerables)
      chartjsRegistered = true
    }
    new Chart(canvas, config)
  } catch (err) {
    el.innerHTML = `<p class="chart-error">Could not render chart: ${escapeHtml(errorMessage(err))}</p>`
  }
}

async function renderPlotly(el: HTMLElement, source: string): Promise<void> {
  try {
    const config = JSON.parse(source)
    const { default: Plotly } = await import('plotly.js-dist-min')
    // Transparent background + the app's own text color (a live CSS
    // variable, resolved by the browser same as any other inline style —
    // not a static hex baked in at render time) so a chart actually reads
    // as part of the note instead of a chart-library-white box dropped
    // into a dark theme. `height` comes first (not after the spread) so a
    // note's own layout can still override it — but without *some*
    // explicit height, Plotly sizes itself off the placeholder div's
    // actual layout height, which print.css/markdown.css never gave a
    // real value beyond a couple of ems: a real export came back with
    // only axis labels visible and no actual plot area, confirming this.
    await Plotly.newPlot(el, config.data, {
      height: 400,
      ...config.layout,
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: 'var(--text-primary)' },
    })
  } catch (err) {
    el.innerHTML = `<p class="chart-error">Could not render chart: ${escapeHtml(errorMessage(err))}</p>`
  }
}

// Fills in the placeholders plugin-chart.ts emits for ```mermaid/plotly/
// chartjs fenced code blocks — same "sync placeholder, async resolve
// after mount" pattern as images/transclusion, since all three chart
// libraries are dynamically imported (renderBody()/renderNote() stay
// synchronous) and mermaid/Plotly specifically need a real browser DOM to
// even load, so they can't be lazily warmed any earlier than this.
export function useCharts(containerRef: RefObject<HTMLDivElement | null>) {
  const isDark = useUIStore((s) => s.theme === 'dark')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // :not(.chart-loaded) keeps this cheap on every other render this
    // fires on (no dependency array — see useTransclusion/useImageResolution
    // for why: Block.tsx's active/inactive swap and NoteView's Read/Edit
    // toggle both remount this content from scratch, so a fresh,
    // unresolved placeholder can reappear without any prop actually
    // changing, which a dependency array would miss).
    container.querySelectorAll<HTMLElement>('.chart-mermaid:not(.chart-loaded)').forEach((el) => {
      const source = el.getAttribute('data-chart-source')
      if (source === null) return
      el.classList.add('chart-loaded')
      renderMermaid(el, source, isDark)
    })
    container.querySelectorAll<HTMLElement>('.chart-chartjs:not(.chart-loaded)').forEach((el) => {
      const source = el.getAttribute('data-chart-source')
      if (source === null) return
      el.classList.add('chart-loaded')
      renderChartjs(el, source)
    })
    container.querySelectorAll<HTMLElement>('.chart-plotly:not(.chart-loaded)').forEach((el) => {
      const source = el.getAttribute('data-chart-source')
      if (source === null) return
      el.classList.add('chart-loaded')
      renderPlotly(el, source)
    })
  })
}
