import { useEffect, useRef, useState, type RefObject } from 'react'
import { Plus, Trash2, BarChart3, LineChart, PieChart } from 'lucide-react'
import {
  parseChartBlock,
  serializeChartSpec,
  type SimpleChartSpec,
  type ChartType,
  type ChartRow,
} from '../../lib/chart-syntax'

interface ChartBlockEditorProps {
  id: string
  value: string
  onChange: (id: string, rawText: string) => void
}

const CHART_TYPE_OPTIONS: { type: ChartType; label: string; icon: typeof BarChart3 }[] = [
  { type: 'bar', label: 'Bar', icon: BarChart3 },
  { type: 'line', label: 'Line', icon: LineChart },
  { type: 'pie', label: 'Pie', icon: PieChart },
]

// A small palette matching chart-syntax.ts's own PALETTE — kept in sync by
// eye rather than importing it, since this is only for the live preview's
// canvas/plot rendering, not the serialized output itself.
const PREVIEW_COLORS = ['#6fa8c9', '#c96f9e', '#9ec96f', '#c9a06f', '#8f6fc9', '#6fc9b8']

// Renders the actual chart library into `el` for a live preview as the grid
// is edited — separate from useCharts.ts's own render functions (those fill
// in Read-mode's static placeholders once; this needs to re-render on every
// spec change, and chart.js/plotly's own update APIs (`.update()`/
// `Plotly.react`) are what make repeated re-renders cheap instead of
// tearing down and rebuilding the whole chart on every keystroke).
function useLivePreview(containerRef: RefObject<HTMLDivElement | null>, spec: SimpleChartSpec) {
  const chartRef = useRef<import('chart.js').Chart | null>(null)

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container) return

    async function render() {
      if (spec.engine === 'chartjs') {
        const { Chart, registerables } = await import('chart.js')
        if (cancelled || !container) return
        Chart.register(...registerables)
        // Chart.js can't reliably switch a live instance's chart *type* in
        // place — destroying and recreating on every spec change is simpler
        // than trying to patch one in, and cheap enough for the small
        // datasets this editor targets.
        chartRef.current?.destroy()
        const canvas = document.createElement('canvas')
        container.replaceChildren(canvas)
        chartRef.current = new Chart(canvas, {
          type: spec.chartType,
          data: {
            labels: spec.rows.map((r) => r.label),
            datasets: [
              {
                label: spec.title || 'Series 1',
                data: spec.rows.map((r) => r.value),
                backgroundColor: spec.chartType === 'line' ? PREVIEW_COLORS[0] : PREVIEW_COLORS,
              },
            ],
          },
          options: { responsive: true, maintainAspectRatio: false },
        })
      } else {
        const { default: Plotly } = await import('plotly.js-dist-min')
        if (cancelled || !container) return
        container.replaceChildren()
        const layout = {
          height: 260,
          margin: { t: spec.title ? 32 : 12, b: 32, l: 40, r: 12 },
          title: spec.title ? { text: spec.title } : undefined,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: 'var(--text-primary)' },
        }
        const trace =
          spec.chartType === 'pie'
            ? { type: 'pie' as const, labels: spec.rows.map((r) => r.label), values: spec.rows.map((r) => r.value) }
            : spec.chartType === 'line'
              ? {
                  type: 'scatter' as const,
                  mode: 'lines+markers' as const,
                  x: spec.rows.map((r) => r.label),
                  y: spec.rows.map((r) => r.value),
                }
              : { type: 'bar' as const, x: spec.rows.map((r) => r.label), y: spec.rows.map((r) => r.value) }
        // Plotly's own type defs don't expose `.react` (its documented,
        // more-efficient in-place update API) — `newPlot` is what
        // useCharts.ts's own renderPlotly already uses too, and rebuilding
        // the plot on every edit is cheap enough for this editor's small
        // datasets.
        await Plotly.newPlot(container, [trace], layout)
      }
    }

    render()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spec's own fields are the real deps; comparing the whole object each render is what we want (any row/title/type change should re-render)
  }, [spec.engine, spec.chartType, spec.title, JSON.stringify(spec.rows)])

  // Chart.js instances need an explicit destroy on unmount — Plotly's own
  // DOM node just gets discarded along with the rest of the block's markup,
  // no separate cleanup call needed.
  useEffect(() => {
    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [])
}

// Same {id, value, onChange} shape as TableGridEditor/MathBlockEditor —
// value is the block's full rawText (the ```chartjs/```plotly fence
// included), parsed the same way those two parse their own value. Falls
// back to an empty default spec if `value` doesn't parse (shouldn't happen
// in practice — Block.tsx only mounts this once parseChartBlock has already
// confirmed it does — but keeps this component safe to use standalone).
export function ChartBlockEditor({ id, value, onChange }: ChartBlockEditorProps) {
  const [spec, setSpec] = useState<SimpleChartSpec>(() => parseChartBlock(value) ?? { engine: 'chartjs', chartType: 'bar', title: '', rows: [] })
  const previewRef = useRef<HTMLDivElement>(null)
  useLivePreview(previewRef, spec)

  function update(next: SimpleChartSpec) {
    setSpec(next)
    onChange(id, serializeChartSpec(next))
  }

  function updateRow(index: number, patch: Partial<ChartRow>) {
    update({ ...spec, rows: spec.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) })
  }

  function addRow() {
    update({ ...spec, rows: [...spec.rows, { label: '', value: 0 }] })
  }

  function removeRow(index: number) {
    update({ ...spec, rows: spec.rows.filter((_, i) => i !== index) })
  }

  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
          {CHART_TYPE_OPTIONS.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs hover:opacity-80"
              style={{
                background: spec.chartType === type ? 'var(--accent-link)' : undefined,
                color: spec.chartType === type ? 'var(--bg-primary)' : 'var(--text-secondary)',
              }}
              onClick={() => update({ ...spec, chartType: type })}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={spec.title}
          onChange={(e) => update({ ...spec, title: e.target.value })}
          placeholder="Chart title (optional)"
          className="min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-xs outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        />
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] tracking-wide uppercase"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
        >
          {spec.engine === 'chartjs' ? 'Chart.js' : 'Plotly'}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-x-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          {spec.rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={row.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                placeholder="Label"
                className="w-0 min-w-0 flex-1 rounded border px-2 py-1 text-xs outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
              <input
                type="number"
                value={row.value}
                onChange={(e) => updateRow(i, { value: Number(e.target.value) })}
                className="w-20 rounded border px-2 py-1 text-xs outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                aria-label="Remove row"
                className="shrink-0 rounded p-1 hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => removeRow(i)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="mt-0.5 flex w-fit items-center gap-1 rounded px-1.5 py-1 text-xs opacity-70 hover:opacity-100"
            style={{ color: 'var(--accent-link)' }}
            onClick={addRow}
          >
            <Plus size={12} />
            Add row
          </button>
        </div>

        <div className="col-span-2 sm:col-span-1">
          {spec.rows.length > 0 ? (
            <div ref={previewRef} className="h-[260px] w-full" />
          ) : (
            <div
              className="flex h-[260px] items-center justify-center rounded text-xs"
              style={{ color: 'var(--text-muted)', background: 'var(--bg-primary)' }}
            >
              Add a row to see a preview
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
