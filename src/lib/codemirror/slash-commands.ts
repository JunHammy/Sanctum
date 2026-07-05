import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'

interface Snippet {
  label: string
  detail: string
  snippet: string
  cursorOffset: number
}

const SNIPPETS: Snippet[] = [
  { label: 'Callout', detail: '> [!NOTE]', snippet: '> [!NOTE] \n> ', cursorOffset: 13 },
  { label: 'Table', detail: 'pipe table', snippet: '| Column | Column |\n| --- | --- |\n| Cell | Cell |\n', cursorOffset: 2 },
  { label: 'Code block', detail: 'fenced code', snippet: '```\n\n```', cursorOffset: 4 },
  { label: 'Heading', detail: '##', snippet: '## ', cursorOffset: 3 },
  { label: 'Bullet list', detail: '-', snippet: '- ', cursorOffset: 2 },
  { label: 'Task list', detail: '- [ ]', snippet: '- [ ] ', cursorOffset: 6 },
]

// Trigger only at the very start of a line, or right after whitespace —
// mirrors Notion/Obsidian's scoping so typing "and/or" mid-sentence doesn't
// pop the menu.
function findTrigger(view: EditorView): { from: number; to: number; query: string } | null {
  const { main } = view.state.selection
  if (!main.empty) return null
  const pos = main.head
  const line = view.state.doc.lineAt(pos)
  const textBefore = line.text.slice(0, pos - line.from)
  const match = /(^|[ \t])\/(\w*)$/.exec(textBefore)
  if (!match) return null
  const slashIndex = match.index + match[1].length
  return { from: line.from + slashIndex, to: pos, query: match[2] }
}

// Hand-rolled instead of @codemirror/autocomplete's autocompletion(): that
// approach's dropdown reliably failed to render inside a block (a block
// sits in a position:relative wrapper — BlockEditor's per-block container —
// which CodeMirror's tooltip plugin treats as its own containing context),
// and anchoring tooltips() to document.body didn't fix it either. Owning
// the whole widget removes any dependency on autocomplete's internals.
class SlashMenu {
  dom: HTMLElement
  view: EditorView
  from = -1
  to = -1
  selected = 0
  items: Snippet[] = []
  private onKeyDown: (event: KeyboardEvent) => void
  private onReposition: () => void

  constructor(view: EditorView) {
    this.view = view
    this.dom = document.createElement('div')
    this.dom.className = 'sanctum-slash-menu'
    this.dom.style.display = 'none'
    document.body.appendChild(this.dom)

    // Capture phase so this runs before CodeMirror's own keymap handling —
    // otherwise Enter/Arrow keys would both select a menu item *and* do
    // their normal editor thing (insert a newline, move the cursor) at once.
    this.onKeyDown = this.handleKeyDown.bind(this)
    view.dom.addEventListener('keydown', this.onKeyDown, true)

    // The menu is positioned in fixed/viewport coordinates computed once
    // when it opens — without this it just stays glued to that spot on the
    // screen as soon as any ancestor (the note's own scroll container, the
    // page) scrolls, instead of tracking the "/" it's attached to. Capture
    // phase on window catches scroll events from any nested scrollable
    // ancestor, since scroll events don't bubble but do fire during capture.
    this.onReposition = () => {
      if (this.isOpen()) this.scheduleReposition()
    }
    window.addEventListener('scroll', this.onReposition, true)
    window.addEventListener('resize', this.onReposition)
  }

  update(update: ViewUpdate) {
    if (!update.docChanged && !update.selectionSet) return
    const trigger = update.view.hasFocus ? findTrigger(update.view) : null
    if (!trigger) {
      this.close()
      return
    }
    const items = SNIPPETS.filter((s) => s.label.toLowerCase().startsWith(trigger.query.toLowerCase()))
    if (items.length === 0) {
      this.close()
      return
    }
    this.items = items
    this.from = trigger.from
    this.to = trigger.to
    this.selected = Math.min(this.selected, items.length - 1)
    this.scheduleReposition()
  }

  // view.coordsAtPos() reads layout, which CodeMirror forbids doing
  // synchronously inside update() — it throws "Reading the editor layout
  // isn't allowed during an update" and the plugin gets torn down as a
  // result (silently, from the outside — it just never showed anything).
  // requestMeasure defers the read to CodeMirror's own measure phase,
  // right after the update finishes (or after a scroll/resize), which is
  // the supported way to do this.
  scheduleReposition() {
    this.view.requestMeasure({
      key: 'sanctum-slash-menu',
      read: (view) => view.coordsAtPos(this.from),
      write: (coords) => this.position(coords),
    })
  }

  position(coords: { left: number; bottom: number } | null) {
    if (!coords) {
      this.close()
      return
    }
    this.dom.style.display = 'block'
    this.dom.style.left = `${coords.left}px`
    this.dom.style.top = `${coords.bottom + 4}px`
    this.renderItems()
  }

  // Rebuilds the item list only — no layout read, safe to call directly
  // from the keydown handler (outside CodeMirror's update cycle) when just
  // moving the selection, without repositioning the whole menu.
  renderItems() {
    this.dom.innerHTML = ''
    this.items.forEach((item, i) => {
      const row = document.createElement('div')
      row.className = 'sanctum-slash-item' + (i === this.selected ? ' is-selected' : '')

      const label = document.createElement('span')
      label.className = 'sanctum-slash-label'
      label.textContent = item.label
      const detail = document.createElement('span')
      detail.className = 'sanctum-slash-detail'
      detail.textContent = item.detail
      row.append(label, detail)

      // mousedown (not click) fires before the editor's blur handling would
      // otherwise steal focus and close the menu first. stopPropagation is
      // load-bearing here, not just tidy: this.dom lives on document.body
      // (see the constructor), outside the block's own DOM subtree, so
      // without it this event bubbles up to BlockEditor's document-level
      // "click outside the active block" listener — which would then
      // deactivate the block (unmounting this very editor) on the same
      // click that just inserted the snippet.
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.apply(item)
      })
      this.dom.appendChild(row)
    })
  }

  apply(item: Snippet) {
    const { from, to } = this
    this.close()
    this.view.dispatch({
      changes: { from, to, insert: item.snippet },
      selection: { anchor: from + item.cursorOffset },
    })
    this.view.focus()
  }

  isOpen() {
    return this.dom.style.display !== 'none'
  }

  close() {
    this.from = -1
    this.to = -1
    this.dom.style.display = 'none'
  }

  handleKeyDown(event: KeyboardEvent) {
    if (!this.isOpen()) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      this.selected = (this.selected + 1) % this.items.length
      this.renderItems()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      this.selected = (this.selected - 1 + this.items.length) % this.items.length
      this.renderItems()
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      this.apply(this.items[this.selected])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.close()
    }
  }

  destroy() {
    this.view.dom.removeEventListener('keydown', this.onKeyDown, true)
    window.removeEventListener('scroll', this.onReposition, true)
    window.removeEventListener('resize', this.onReposition)
    this.dom.remove()
  }
}

export const slashCommandsExtension = ViewPlugin.fromClass(SlashMenu)
