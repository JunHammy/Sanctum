import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'

// "Add a section via a command instead of memorized syntax" — typing "/" at
// the start of a line (or after whitespace) opens a menu that inserts a
// markdown snippet at the cursor. Uses CodeMirror's own autocomplete
// machinery (already bundled via basicSetup) rather than a custom popup.

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

function slashCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\/\w*/)
  if (!word) return null
  if (word.from === word.to && !context.explicit) return null

  const line = context.state.doc.lineAt(word.from)
  const isLineStart = word.from === line.from
  const charBefore = context.state.sliceDoc(Math.max(0, word.from - 1), word.from)
  if (!isLineStart && charBefore !== ' ' && charBefore !== '\t') return null

  return {
    from: word.from,
    to: word.to,
    options: SNIPPETS.map((s) => ({
      label: s.label,
      detail: s.detail,
      apply: (view, _completion, from, to) => {
        view.dispatch({
          changes: { from, to, insert: s.snippet },
          selection: { anchor: from + s.cursorOffset },
        })
      },
    })),
  }
}

// Deliberately `override`s the default autocomplete sources rather than
// adding alongside them — a prose editor has no meaningful use for
// basicSetup's default (largely code-oriented) completion behavior anyway.
export const slashCommandsExtension = autocompletion({ override: [slashCompletions] })
