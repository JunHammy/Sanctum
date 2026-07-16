import type MarkdownIt from 'markdown-it'

// Stamps every task-list item (`- [ ]`/`- [x]`) with the raw-source line it
// started at, same `token.map[0]` addressing scheme sourceLinePlugin already
// uses for top-level blocks — but a checkbox needs its own, more specific
// line, not just whatever line its containing (possibly multi-item) list
// started at. Must run after markdown-it-task-lists' own core rule (which
// tags the token with the `task-list-item` class in the first place) —
// `.push()` (append to the end of the core ruler) guarantees that regardless
// of where in the `.use()` chain this gets registered, since task-lists
// itself is inserted mid-chain via `.after('inline', ...)`.
export function taskLinePlugin(md: MarkdownIt): void {
  md.core.ruler.push('task-line', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'list_item_open' || !token.map) continue
      const cls = token.attrGet('class')
      if (cls && cls.includes('task-list-item')) {
        token.attrSet('data-task-line', String(token.map[0]))
      }
    }
    return true
  })
}
