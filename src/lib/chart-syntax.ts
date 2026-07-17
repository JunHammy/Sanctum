// Parser/serializer for a deliberately narrow subset of ```chartjs/```plotly
// fence content — a single-series bar/line/pie chart built from a plain
// label+value data grid, the same "cover the common case, raw JSON is
// always the escape hatch" scope table-syntax.ts/math-syntax.ts already
// established for their own visual editors. Multi-series charts, custom
// axes/options, scatter plots with non-numeric x-values, etc. all
// legitimately exist and are still fully supported — they just don't parse
// here, so Block.tsx falls back to the plain text editor for them instead
// of the visual grid silently mangling something it can't faithfully
// represent.

export type ChartType = 'bar' | 'line' | 'pie'
export type ChartEngine = 'chartjs' | 'plotly'

export interface ChartRow {
  label: string
  value: number
}

export interface SimpleChartSpec {
  engine: ChartEngine
  chartType: ChartType
  title: string
  rows: ChartRow[]
}

const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie']

function isChartType(value: unknown): value is ChartType {
  return typeof value === 'string' && (CHART_TYPES as string[]).includes(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number')
}

function parseChartjsConfig(config: Record<string, unknown>): SimpleChartSpec | null {
  if (!isChartType(config.type)) return null
  const data = config.data
  if (typeof data !== 'object' || data === null) return null
  const { labels, datasets } = data as Record<string, unknown>
  if (!isStringArray(labels)) return null
  if (!Array.isArray(datasets) || datasets.length !== 1) return null
  const dataset = datasets[0]
  if (typeof dataset !== 'object' || dataset === null) return null
  const { data: values, label } = dataset as Record<string, unknown>
  if (!isNumberArray(values) || values.length !== labels.length) return null

  return {
    engine: 'chartjs',
    chartType: config.type,
    title: typeof label === 'string' ? label : '',
    rows: labels.map((l, i) => ({ label: l, value: values[i] })),
  }
}

function extractPlotlyTitle(config: Record<string, unknown>): string {
  const layout = config.layout
  if (typeof layout !== 'object' || layout === null) return ''
  const title = (layout as Record<string, unknown>).title
  if (typeof title === 'string') return title
  if (typeof title === 'object' && title !== null) {
    const text = (title as Record<string, unknown>).text
    if (typeof text === 'string') return text
  }
  return ''
}

function parsePlotlyConfig(config: Record<string, unknown>): SimpleChartSpec | null {
  const traces = config.data
  if (!Array.isArray(traces) || traces.length !== 1) return null
  const trace = traces[0]
  if (typeof trace !== 'object' || trace === null) return null
  const t = trace as Record<string, unknown>
  const title = extractPlotlyTitle(config)

  if (t.type === 'pie') {
    const { labels, values } = t
    if (!isStringArray(labels) || !isNumberArray(values) || labels.length !== values.length) return null
    return { engine: 'plotly', chartType: 'pie', title, rows: labels.map((l, i) => ({ label: l, value: values[i] })) }
  }

  // Plotly represents both bar and line charts as x/y arrays — a bare
  // 'bar' trace, or a 'scatter' trace with mode including 'lines', are the
  // only two shapes recognized here. Anything else (markers-only scatter,
  // no explicit type, multiple modes) falls through to raw editing rather
  // than guessing which chart type was actually intended.
  const isBar = t.type === 'bar'
  const isLine = t.type === 'scatter' && typeof t.mode === 'string' && t.mode.includes('lines')
  if (!isBar && !isLine) return null

  const x = t.x
  const y = t.y
  if (!Array.isArray(x) || !isNumberArray(y) || x.length !== y.length) return null
  if (!x.every((v) => typeof v === 'string' || typeof v === 'number')) return null

  return {
    engine: 'plotly',
    chartType: isBar ? 'bar' : 'line',
    title,
    rows: x.map((l, i) => ({ label: String(l), value: y[i] })),
  }
}

const FENCE_PATTERN = /^```(chartjs|plotly)\n([\s\S]*?)\n```$/

// Whole-block detection, same shape as parseTable/parseMathBlock — the
// entire block must be exactly one recognized fence, with only whitespace
// outside it.
export function parseChartBlock(rawText: string): SimpleChartSpec | null {
  const match = FENCE_PATTERN.exec(rawText.trim())
  if (!match) return null
  const engine = match[1] as ChartEngine
  let config: unknown
  try {
    config = JSON.parse(match[2])
  } catch {
    return null
  }
  if (typeof config !== 'object' || config === null) return null
  return engine === 'chartjs'
    ? parseChartjsConfig(config as Record<string, unknown>)
    : parsePlotlyConfig(config as Record<string, unknown>)
}

// A small, fixed palette rather than random colors — repeats past 6 rows
// (a chart with more categories than that is reading as a list at a glance
// either way, so color-per-category stops being the useful signal it is
// for a small chart).
const PALETTE = ['#6fa8c9', '#c96f9e', '#9ec96f', '#c9a06f', '#8f6fc9', '#6fc9b8']

export function createDefaultChartSpec(engine: ChartEngine): SimpleChartSpec {
  return {
    engine,
    chartType: 'bar',
    title: '',
    rows: [
      { label: 'Mon', value: 3 },
      { label: 'Tue', value: 5 },
      { label: 'Wed', value: 2 },
    ],
  }
}

export function serializeChartSpec(spec: SimpleChartSpec): string {
  const { engine, chartType, title, rows } = spec
  const colors = rows.map((_, i) => PALETTE[i % PALETTE.length])

  if (engine === 'chartjs') {
    const config = {
      type: chartType,
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          {
            label: title || 'Series 1',
            data: rows.map((r) => r.value),
            backgroundColor: chartType === 'line' ? colors[0] : colors,
          },
        ],
      },
    }
    return `\`\`\`chartjs\n${JSON.stringify(config, null, 2)}\n\`\`\``
  }

  const layout = title ? { title: { text: title } } : {}
  const trace =
    chartType === 'pie'
      ? { type: 'pie', labels: rows.map((r) => r.label), values: rows.map((r) => r.value) }
      : chartType === 'line'
        ? { type: 'scatter', mode: 'lines+markers', x: rows.map((r) => r.label), y: rows.map((r) => r.value) }
        : { type: 'bar', x: rows.map((r) => r.label), y: rows.map((r) => r.value) }
  const config = { data: [trace], layout }
  return `\`\`\`plotly\n${JSON.stringify(config, null, 2)}\n\`\`\``
}
