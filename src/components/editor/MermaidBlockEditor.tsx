import { useEffect, useRef, useState, type RefObject } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useUIStore } from '../../stores/ui.store'
import {
  parseFlowchartBlock,
  serializeFlowchartSpec,
  nextNodeId,
  type SimpleFlowchartSpec,
  type FlowchartNode,
  type FlowchartEdge,
} from '../../lib/mermaid-syntax'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

interface MermaidBlockEditorProps {
  id: string
  value: string
  onChange: (id: string, rawText: string) => void
}

// Re-renders the actual diagram on every spec change, same "live preview,
// not just fill-in-once" need ChartBlockEditor's own preview hook has —
// separate from useCharts.ts's renderMermaid, which only ever fills in a
// Read-mode placeholder a single time.
function useMermaidPreview(containerRef: RefObject<HTMLDivElement | null>, spec: SimpleFlowchartSpec) {
  const isDark = useUIStore((s) => s.theme === 'dark')

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (!container || spec.nodes.length === 0) return

    async function render() {
      const { default: mermaid } = await import('mermaid')
      if (cancelled || !container) return
      mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' })
      const source = serializeFlowchartSpec(spec).replace(/^```mermaid\n/, '').replace(/\n```$/, '')
      const renderId = `mermaid-live-${Math.random().toString(36).slice(2, 10)}`
      try {
        const { svg } = await mermaid.render(renderId, source)
        if (!cancelled) container.innerHTML = svg
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          container.innerHTML = `<p class="chart-error">Could not render diagram: ${message}</p>`
        }
      }
    }

    render()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spec's own fields are the real deps
  }, [isDark, JSON.stringify(spec)])
}

// Same {id, value, onChange} shape as TableGridEditor/MathBlockEditor/
// ChartBlockEditor — value is the block's full rawText (the ```mermaid
// fence included).
export function MermaidBlockEditor({ id, value, onChange }: MermaidBlockEditorProps) {
  const [spec, setSpec] = useState<SimpleFlowchartSpec>(() => parseFlowchartBlock(value) ?? { nodes: [], edges: [] })
  const previewRef = useRef<HTMLDivElement>(null)
  // Same fix as ChartBlockEditor's own debouncedSpec — confirmed real crash
  // on mobile via testing: Mermaid's layout engine (dagre) is genuine,
  // non-trivial work, re-triggered on every keystroke without this. The
  // node/edge list itself still reflects `spec` instantly.
  const debouncedSpec = useDebouncedValue(spec, 400)
  useMermaidPreview(previewRef, debouncedSpec)

  function update(next: SimpleFlowchartSpec) {
    setSpec(next)
    onChange(id, serializeFlowchartSpec(next))
  }

  function addNode() {
    const newId = nextNodeId(spec.nodes)
    update({ ...spec, nodes: [...spec.nodes, { id: newId, label: newId }] })
  }

  function updateNode(nodeId: string, label: string) {
    update({ ...spec, nodes: spec.nodes.map((n) => (n.id === nodeId ? { ...n, label } : n)) })
  }

  function removeNode(nodeId: string) {
    update({
      nodes: spec.nodes.filter((n) => n.id !== nodeId),
      // A node's own edges go with it — an edge pointing at a node that no
      // longer exists would just silently vanish from the rendered diagram
      // anyway (mermaid needs both ends defined), so dropping it here keeps
      // the edge list from accumulating dead references the UI never shows
      // a reason for.
      edges: spec.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    })
  }

  function addEdge() {
    if (spec.nodes.length === 0) return
    const from = spec.nodes[0].id
    const to = spec.nodes[Math.min(1, spec.nodes.length - 1)].id
    update({ ...spec, edges: [...spec.edges, { from, to, label: '' }] })
  }

  function updateEdge(index: number, patch: Partial<FlowchartEdge>) {
    update({ ...spec, edges: spec.edges.map((e, i) => (i === index ? { ...e, ...patch } : e)) })
  }

  function removeEdge(index: number) {
    update({ ...spec, edges: spec.edges.filter((_, i) => i !== index) })
  }

  function nodeLabel(node: FlowchartNode): string {
    return node.label || node.id
  }

  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Nodes
            </div>
            <div className="flex flex-col gap-1.5">
              {spec.nodes.map((node) => (
                <div key={node.id} className="flex items-center gap-1.5">
                  <span
                    className="shrink-0 rounded px-1.5 py-1 text-[10px] font-medium"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
                  >
                    {node.id}
                  </span>
                  <input
                    type="text"
                    value={node.label}
                    onChange={(e) => updateNode(node.id, e.target.value)}
                    placeholder="Label"
                    className="w-0 min-w-0 flex-1 rounded border px-2 py-1 text-xs outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <button
                    type="button"
                    aria-label={`Remove node ${node.id}`}
                    className="shrink-0 rounded p-1 hover:opacity-70"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => removeNode(node.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="flex w-fit items-center gap-1 rounded px-1.5 py-1 text-xs opacity-70 hover:opacity-100"
                style={{ color: 'var(--accent-link)' }}
                onClick={addNode}
              >
                <Plus size={12} />
                Add node
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Connections
            </div>
            <div className="flex flex-col gap-1.5">
              {spec.edges.map((edge, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select
                    value={edge.from}
                    onChange={(e) => updateEdge(i, { from: e.target.value })}
                    className="w-0 min-w-0 flex-1 rounded border px-1.5 py-1 text-xs outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    {spec.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {nodeLabel(n)}
                      </option>
                    ))}
                  </select>
                  <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                    →
                  </span>
                  <select
                    value={edge.to}
                    onChange={(e) => updateEdge(i, { to: e.target.value })}
                    className="w-0 min-w-0 flex-1 rounded border px-1.5 py-1 text-xs outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    {spec.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {nodeLabel(n)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={edge.label}
                    onChange={(e) => updateEdge(i, { label: e.target.value })}
                    placeholder="label"
                    className="w-16 shrink-0 rounded border px-1.5 py-1 text-xs outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <button
                    type="button"
                    aria-label="Remove connection"
                    className="shrink-0 rounded p-1 hover:opacity-70"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => removeEdge(i)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={spec.nodes.length === 0}
                className="flex w-fit items-center gap-1 rounded px-1.5 py-1 text-xs opacity-70 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                style={{ color: 'var(--accent-link)' }}
                onClick={addEdge}
              >
                <Plus size={12} />
                Add connection
              </button>
            </div>
          </div>
        </div>

        {spec.nodes.length > 0 ? (
          <div ref={previewRef} className="flex min-h-[200px] items-center justify-center overflow-auto" />
        ) : (
          <div
            className="flex min-h-[200px] items-center justify-center rounded text-xs"
            style={{ color: 'var(--text-muted)', background: 'var(--bg-primary)' }}
          >
            Add a node to see a preview
          </div>
        )}
      </div>
    </div>
  )
}
