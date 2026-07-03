import { EditorView, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'

// Hides standard CommonMark/GFM syntax markers (#, **, _, `) and applies
// rendered styling (heading size, bold weight, etc.) for nodes the cursor
// isn't currently touching — reveals raw syntax on whichever line has the
// cursor, so it stays directly editable. Same interaction model as
// Obsidian's default "Live Preview" mode.
//
// Custom syntax (wikilinks, callouts, tags, ==highlight==) isn't part of the
// Lezer markdown grammar at all, so it's handled separately in
// custom-syntax-decorations.ts via regex scanning instead of the syntax tree.

interface DecoSpec {
  from: number
  to: number
  deco: Decoration
}

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: 'cm-live-h1',
  ATXHeading2: 'cm-live-h2',
  ATXHeading3: 'cm-live-h3',
  ATXHeading4: 'cm-live-h4',
  ATXHeading5: 'cm-live-h5',
  ATXHeading6: 'cm-live-h6',
}

const HIDE = Decoration.replace({})

function overlapsSelection(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((r) => r.from <= to && r.to >= from)
}

// Emphasis/strikethrough/inline-code all share the same shape: an opening
// mark, content, a closing mark. Hide both marks, style the content between.
function decorateWrapped(node: { node: { getChildren: (name: string) => { from: number; to: number }[] } }, markName: string, cls: string, specs: DecoSpec[]) {
  const marks = node.node.getChildren(markName)
  if (marks.length < 2) return
  const first = marks[0]
  const last = marks[marks.length - 1]
  specs.push({ from: first.from, to: first.to, deco: HIDE })
  specs.push({ from: last.from, to: last.to, deco: HIDE })
  if (first.to < last.from) {
    specs.push({ from: first.to, to: last.from, deco: Decoration.mark({ class: cls }) })
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const specs: DecoSpec[] = []

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const headingClass = HEADING_CLASS[node.name]
        if (headingClass) {
          if (overlapsSelection(view, node.from, node.to)) return
          const mark = node.node.getChild('HeaderMark')
          if (!mark) return
          const hideEnd = Math.min(mark.to + 1, node.to) // swallow the space after "#" too
          specs.push({ from: mark.from, to: hideEnd, deco: HIDE })
          if (hideEnd < node.to) {
            specs.push({ from: hideEnd, to: node.to, deco: Decoration.mark({ class: headingClass }) })
          }
          return
        }

        if (node.name === 'StrongEmphasis' || node.name === 'Emphasis' || node.name === 'Strikethrough') {
          if (overlapsSelection(view, node.from, node.to)) return
          const cls =
            node.name === 'StrongEmphasis'
              ? 'cm-live-strong'
              : node.name === 'Emphasis'
                ? 'cm-live-em'
                : 'cm-live-strike'
          decorateWrapped(node, 'EmphasisMark', cls, specs)
          return
        }

        if (node.name === 'InlineCode') {
          if (overlapsSelection(view, node.from, node.to)) return
          decorateWrapped(node, 'CodeMark', 'cm-live-code', specs)
        }
      },
    })
  }

  specs.sort((a, b) => a.from - b.from || a.to - b.to)
  const builder = new RangeSetBuilder<Decoration>()
  for (const spec of specs) {
    if (spec.from < spec.to) builder.add(spec.from, spec.to, spec.deco)
  }
  return builder.finish()
}

export const livePreviewExtension = ViewPlugin.fromClass(
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
