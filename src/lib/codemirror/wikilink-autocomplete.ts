import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { useVaultStore } from '../../stores/vault.store'
import { resolveWikilink } from '../wikilink-resolver'
import { readFile } from '../../services/drive.service'
import { extractFrontmatter } from '../../services/markdown.service'
import { flattenFiles } from '../../services/search.service'

const MAX_ITEMS = 8

interface NoteItem {
  kind: 'note'
  id: string
  name: string
}
interface HeadingItem {
  kind: 'heading'
  text: string
}
type MenuItem = NoteItem | HeadingItem

// Cached per fileId — an autocomplete convenience, not correctness-critical,
// so a little staleness within a session (a heading renamed in a note
// already queried once) is an acceptable tradeoff for not re-fetching on
// every keystroke of the #heading portion.
const headingCache = new Map<string, string[]>()
const headingFetches = new Map<string, Promise<string[]>>()

function extractHeadings(content: string): string[] {
  const headings: string[] = []
  const pattern = /^#{1,6}\s+(.*)$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) headings.push(match[1].trim())
  return headings
}

function fetchHeadings(fileId: string): Promise<string[]> {
  const cached = headingCache.get(fileId)
  if (cached) return Promise.resolve(cached)
  let promise = headingFetches.get(fileId)
  if (!promise) {
    promise = readFile(fileId).then((raw) => {
      const headings = extractHeadings(extractFrontmatter(raw).content)
      headingCache.set(fileId, headings)
      return headings
    })
    headingFetches.set(fileId, promise)
    promise.catch(() => headingFetches.delete(fileId)) // allow retrying a genuine failure later
  }
  return promise
}

interface Trigger {
  from: number // start of the query text (right after `[[`/`![[`, or right after `#`)
  to: number
  stage: 'note' | 'heading'
  query: string
  notePart: string
}

// Triggers on `[[` or `![[` not yet closed by `]]`, anywhere on the line
// (unlike slash-commands' start-of-line restriction — a wikilink can sit
// mid-sentence). The note name is always everything before the *first*
// `#`, but the active query is everything after the *last* `#` — needed
// for the transclusion heading-range syntax (`Note#Section1..#Section2`):
// typing that second `#` needs to reset the query to empty and re-offer
// heading suggestions for the same note, not keep treating the whole
// "Section1..#" tail as one never-matching search string. A `^` anywhere
// bails out entirely — block-id isn't offered here.
function findTrigger(view: EditorView): Trigger | null {
  const { main } = view.state.selection
  if (!main.empty) return null
  const pos = main.head
  const line = view.state.doc.lineAt(pos)
  const textBefore = line.text.slice(0, pos - line.from)
  const match = /(!?\[\[)([^[\]]*)$/.exec(textBefore)
  if (!match) return null
  const inner = match[2]
  if (inner.includes('^')) return null

  const innerStart = line.from + textBefore.length - inner.length
  const firstHashIdx = inner.indexOf('#')
  if (firstHashIdx === -1) {
    return { from: innerStart, to: pos, stage: 'note', query: inner, notePart: inner }
  }

  const notePart = inner.slice(0, firstHashIdx)
  const headingSegment = inner.slice(firstHashIdx + 1)
  const lastHashIdx = headingSegment.lastIndexOf('#')
  const query = lastHashIdx === -1 ? headingSegment : headingSegment.slice(lastHashIdx + 1)
  const queryOffset = firstHashIdx + 1 + (lastHashIdx === -1 ? 0 : lastHashIdx + 1)

  return { from: innerStart + queryOffset, to: pos, stage: 'heading', query, notePart }
}

// Same hand-rolled-widget approach as slash-commands.ts, for the same
// reason: @codemirror/autocomplete's dropdown breaks inside a block's
// position:relative wrapper, and this needs two lookup stages (notes,
// then that note's headings) a generic autocomplete source doesn't fit
// cleanly anyway.
class WikilinkMenu {
  dom: HTMLElement
  view: EditorView
  from = -1
  to = -1
  selected = 0
  items: MenuItem[] = []
  private trigger: Trigger | null = null
  private requestId = 0
  private onKeyDown: (event: KeyboardEvent) => void
  private onReposition: () => void

  constructor(view: EditorView) {
    this.view = view
    this.dom = document.createElement('div')
    this.dom.className = 'sanctum-slash-menu' // reuses the slash-command menu's visual chrome
    this.dom.style.display = 'none'
    document.body.appendChild(this.dom)

    this.onKeyDown = this.handleKeyDown.bind(this)
    view.dom.addEventListener('keydown', this.onKeyDown, true)

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
    this.trigger = trigger
    this.from = trigger.from
    this.to = trigger.to
    const myRequest = ++this.requestId

    if (trigger.stage === 'note') {
      const fileTree = useVaultStore.getState().fileTree
      const q = trigger.query.toLowerCase()
      const items: MenuItem[] = flattenFiles(fileTree)
        .filter((f) => f.name.replace(/\.md$/, '').toLowerCase().includes(q))
        .slice(0, MAX_ITEMS)
        .map((f) => ({ kind: 'note', id: f.id, name: f.name.replace(/\.md$/, '') }))
      this.setItems(items)
      return
    }

    // stage === 'heading' — resolve which note, then (async) fetch/cache
    // its headings and filter by whatever's typed after '#' so far.
    const fileId = resolveWikilink(trigger.notePart.trim(), useVaultStore.getState().fileTree)
    if (!fileId) {
      this.close() // typo'd/unrecognized note name — nothing to suggest headings from
      return
    }
    this.setItems([]) // clear stale items from a previous note while this one loads
    fetchHeadings(fileId).then((headings) => {
      if (myRequest !== this.requestId) return // superseded by a newer keystroke
      const q = trigger.query.toLowerCase()
      const items: MenuItem[] = headings
        .filter((h) => h.toLowerCase().includes(q))
        .slice(0, MAX_ITEMS)
        .map((text) => ({ kind: 'heading', text }))
      this.setItems(items)
    })
  }

  setItems(items: MenuItem[]) {
    this.items = items
    this.selected = Math.min(this.selected, Math.max(0, items.length - 1))
    this.scheduleReposition()
  }

  scheduleReposition() {
    this.view.requestMeasure({
      key: 'sanctum-wikilink-menu',
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

  renderItems() {
    this.dom.innerHTML = ''
    if (this.items.length === 0) {
      const row = document.createElement('div')
      row.className = 'sanctum-slash-item'
      row.style.cursor = 'default'
      row.style.opacity = '0.6'
      row.textContent = this.trigger?.stage === 'heading' ? 'Loading headings…' : 'No matching notes'
      this.dom.appendChild(row)
      return
    }
    this.items.forEach((item, i) => {
      const row = document.createElement('div')
      row.className = 'sanctum-slash-item' + (i === this.selected ? ' is-selected' : '')
      const label = document.createElement('span')
      label.className = 'sanctum-slash-label'
      label.textContent = item.kind === 'note' ? item.name : `# ${item.text}`
      row.appendChild(label)

      // mousedown + stopPropagation, not click — same load-bearing reason
      // as slash-commands.ts: this.dom lives on document.body, outside the
      // block's own DOM subtree, so without stopPropagation this event
      // bubbles to BlockEditor's "click outside the active block" listener
      // and deactivates the block on the same click that just inserted text.
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.apply(item)
      })
      this.dom.appendChild(row)
    })
  }

  apply(item: MenuItem) {
    if (!this.trigger) return
    const { from, to } = this
    this.close()
    // Neither stage closes the brackets — a heading selection used to
    // auto-append `]]`, which seemed convenient for the common single-
    // heading case but actively broke building a range: selecting the
    // *first* heading immediately closed the link, so continuing to type
    // `..#Second` landed as plain text outside it instead of extending
    // the link. Leaving the cursor right after the inserted text either
    // way — for both a note and a heading — means '#' or '..#' immediately
    // continues the same link, and you type the closing `]]` yourself
    // whenever you're actually done (after one heading or after a range).
    const insertText = item.kind === 'note' ? item.name : item.text
    this.view.dispatch({
      changes: { from, to, insert: insertText },
      selection: { anchor: from + insertText.length },
    })
    this.view.focus()
  }

  isOpen() {
    return this.dom.style.display !== 'none'
  }

  close() {
    this.from = -1
    this.to = -1
    this.trigger = null
    this.items = []
    this.dom.style.display = 'none'
  }

  handleKeyDown(event: KeyboardEvent) {
    if (!this.isOpen()) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      if (this.items.length === 0) return
      this.selected = (this.selected + 1) % this.items.length
      this.renderItems()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      if (this.items.length === 0) return
      this.selected = (this.selected - 1 + this.items.length) % this.items.length
      this.renderItems()
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      if (this.items.length === 0) return
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

export const wikilinkAutocompleteExtension = ViewPlugin.fromClass(WikilinkMenu)
