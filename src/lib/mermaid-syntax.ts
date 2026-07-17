// Parser/serializer for a deliberately narrow subset of ```mermaid fence
// content — a single flowchart built from a plain node list + edge list,
// same "cover the common case, raw syntax is always the escape hatch"
// scope chart-syntax.ts/table-syntax.ts already established. Mermaid
// supports many diagram types (sequence, gantt, class, state, ...) and,
// even within flowcharts, many node shapes/link styles — none of that
// parses here, so Block.tsx falls back to the plain text editor for
// anything beyond plain rectangle nodes and simple (optionally labeled)
// arrows.

export interface FlowchartNode {
  id: string
  label: string
}

export interface FlowchartEdge {
  from: string
  to: string
  label: string
}

export interface SimpleFlowchartSpec {
  nodes: FlowchartNode[]
  edges: FlowchartEdge[]
}

const ID_PATTERN = '[A-Za-z][A-Za-z0-9_]*'
const NODE_DEF_PATTERN = new RegExp(`^(${ID_PATTERN})\\[([^\\]]*)\\]$`)
const EDGE_PATTERN = new RegExp(
  `^(${ID_PATTERN})(?:\\[([^\\]]*)\\])?\\s*-->\\s*(?:\\|([^|]*)\\|\\s*)?(${ID_PATTERN})(?:\\[([^\\]]*)\\])?$`,
)
const FENCE_PATTERN = /^```mermaid\n([\s\S]*?)\n```$/

// Whole-block detection, same shape as parseTable/parseChartBlock — the
// entire block must be exactly one ```mermaid fence containing only a
// `graph <direction>` header followed by plain node definitions
// (`ID[Label]`) and/or simple arrows (`ID --> ID`, optionally
// `ID -->|label| ID`), each on its own line. Any other line shape (a
// different node style, subgraphs, styling directives, a non-flowchart
// diagram type) bails out entirely rather than silently dropping content
// it can't represent.
export function parseFlowchartBlock(rawText: string): SimpleFlowchartSpec | null {
  const match = FENCE_PATTERN.exec(rawText.trim())
  if (!match) return null

  const lines = match[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return null
  if (!/^graph\s+(TD|TB|LR|RL|BT)\s*$/.test(lines[0])) return null

  const nodes = new Map<string, string>()
  const edges: FlowchartEdge[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]

    const nodeMatch = NODE_DEF_PATTERN.exec(line)
    if (nodeMatch) {
      nodes.set(nodeMatch[1], nodeMatch[2])
      continue
    }

    const edgeMatch = EDGE_PATTERN.exec(line)
    if (edgeMatch) {
      const [, fromId, fromLabel, edgeLabel, toId, toLabel] = edgeMatch
      if (!nodes.has(fromId) || fromLabel !== undefined) nodes.set(fromId, fromLabel ?? fromId)
      if (!nodes.has(toId) || toLabel !== undefined) nodes.set(toId, toLabel ?? toId)
      edges.push({ from: fromId, to: toId, label: edgeLabel ?? '' })
      continue
    }

    return null
  }

  if (nodes.size === 0) return null
  return { nodes: Array.from(nodes, ([id, label]) => ({ id, label })), edges }
}

// A-Z first (reads better for the small diagrams this editor targets),
// falling back to N1, N2, ... past 26 nodes rather than wrapping to AA/AB.
export function nextNodeId(existing: FlowchartNode[]): string {
  const used = new Set(existing.map((n) => n.id))
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(65 + i)
    if (!used.has(id)) return id
  }
  let n = 1
  while (used.has(`N${n}`)) n++
  return `N${n}`
}

export function createDefaultFlowchartSpec(): SimpleFlowchartSpec {
  return {
    nodes: [
      { id: 'A', label: 'Start' },
      { id: 'B', label: 'Decision' },
      { id: 'C', label: 'End' },
    ],
    edges: [
      { from: 'A', to: 'B', label: '' },
      { from: 'B', to: 'C', label: 'Yes' },
    ],
  }
}

export function serializeFlowchartSpec(spec: SimpleFlowchartSpec): string {
  const lines = ['graph TD']
  const labelById = new Map(spec.nodes.map((n) => [n.id, n.label]))
  const referenced = new Set(spec.edges.flatMap((e) => [e.from, e.to]))

  // Isolated nodes (not part of any edge) still need a line of their own,
  // or they wouldn't appear in the diagram at all.
  for (const node of spec.nodes) {
    if (!referenced.has(node.id)) lines.push(`  ${node.id}[${node.label}]`)
  }

  for (const edge of spec.edges) {
    const fromLabel = labelById.get(edge.from) ?? edge.from
    const toLabel = labelById.get(edge.to) ?? edge.to
    const labelPart = edge.label ? `|${edge.label}| ` : ''
    lines.push(`  ${edge.from}[${fromLabel}] --> ${labelPart}${edge.to}[${toLabel}]`)
  }

  return `\`\`\`mermaid\n${lines.join('\n')}\n\`\`\``
}
