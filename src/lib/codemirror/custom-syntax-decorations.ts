import { EditorView, Decoration, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// Live-preview decorations for Sanctum's custom syntax (wikilinks, callouts,
// tags, ==highlight==) — none of this is part of the standard CommonMark/GFM
// Lezer grammar live-preview.ts works from, so it's handled here via regex
// scanning instead, mirroring the same patterns the read-mode plugins use
// (lib/markdown-plugins/plugin-wikilink.ts, plugin-callout.ts, plugin-tag.ts).

interface DecoSpec {
  from: number
  to: number
  deco: Decoration
}

const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g
const HIGHLIGHT_PATTERN = /==([^=\n]+)==/g
const TAG_PATTERN = /(^|\s)#([a-zA-Z0-9_-]+)/g
const CALLOUT_MARKER_PATTERN = /^\[!(\w+)\]/
const BLOCKQUOTE_LINE_PATTERN = /^(\s*>\s?)(.*)$/

const HIDE = Decoration.replace({})

class WikilinkWidget extends WidgetType {
  display: string

  constructor(display: string) {
    super()
    this.display = display
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-live-wikilink'
    span.textContent = this.display
    return span
  }

  eq(other: WikilinkWidget) {
    return other.display === this.display
  }
}

function wikilinkDisplay(inner: string): string {
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

  target = target.trim()
  if (alias.trim()) return alias.trim()
  if (blockId.trim()) return `${target} > ^${blockId.trim()}`
  if (heading.trim()) return `${target} > ${heading.trim()}`
  return target
}

function overlapsSelection(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((r) => r.from <= to && r.to >= from)
}

function addInlineDecorations(view: EditorView, from: number, to: number, specs: DecoSpec[]) {
  const text = view.state.doc.sliceString(from, to)

  WIKILINK_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WIKILINK_PATTERN.exec(text))) {
    const start = from + match.index
    const end = start + match[0].length
    if (overlapsSelection(view, start, end)) continue
    specs.push({ from: start, to: end, deco: Decoration.replace({ widget: new WikilinkWidget(wikilinkDisplay(match[1])) }) })
  }

  HIGHLIGHT_PATTERN.lastIndex = 0
  while ((match = HIGHLIGHT_PATTERN.exec(text))) {
    const start = from + match.index
    const end = start + match[0].length
    if (overlapsSelection(view, start, end)) continue
    specs.push({ from: start, to: start + 2, deco: HIDE })
    specs.push({ from: start + 2, to: end - 2, deco: Decoration.mark({ class: 'cm-live-highlight' }) })
    specs.push({ from: end - 2, to: end, deco: HIDE })
  }

  TAG_PATTERN.lastIndex = 0
  while ((match = TAG_PATTERN.exec(text))) {
    const tagStart = from + match.index + match[1].length
    const tagEnd = tagStart + 1 + match[2].length
    specs.push({ from: tagStart, to: tagEnd, deco: Decoration.mark({ class: 'cm-live-tag' }) })
  }
}

function addCalloutLineDecorations(view: EditorView, from: number, to: number, specs: DecoSpec[]) {
  const doc = view.state.doc
  let currentType: string | null = null
  let pos = from

  while (pos <= to) {
    const line = doc.lineAt(pos)
    const blockquoteMatch = line.text.match(BLOCKQUOTE_LINE_PATTERN)

    if (blockquoteMatch) {
      const rest = blockquoteMatch[2]
      const markerMatch = rest.match(CALLOUT_MARKER_PATTERN)
      if (markerMatch) {
        currentType = markerMatch[1].toLowerCase()
        const markerStart = line.from + blockquoteMatch[1].length
        specs.push({ from: markerStart, to: markerStart + markerMatch[0].length, deco: Decoration.mark({ class: 'cm-live-callout-marker' }) })
      }
      if (currentType) {
        specs.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `cm-live-callout cm-live-callout-${currentType}` }) })
      }
    } else if (line.text.trim() !== '') {
      currentType = null
    }

    if (line.to >= to) break
    pos = line.to + 1
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const specs: DecoSpec[] = []

  for (const { from, to } of view.visibleRanges) {
    addInlineDecorations(view, from, to, specs)
    addCalloutLineDecorations(view, from, to, specs)
  }

  // Line decorations (Decoration.line, zero-width "from === to") must sort
  // before other decorations that start at the same position.
  specs.sort((a, b) => a.from - b.from || a.to - b.to)
  const builder = new RangeSetBuilder<Decoration>()
  for (const spec of specs) {
    if (spec.from <= spec.to) builder.add(spec.from, spec.to, spec.deco)
  }
  return builder.finish()
}

export const customSyntaxExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
