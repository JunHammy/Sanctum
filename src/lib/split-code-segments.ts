// Structurally the same shape as python-syntax.ts's PersistedPythonOutput
// and javascript-syntax.ts's PersistedJsOutput (declared fresh, same
// reasoning as those two — this layer only ever passes the parsed JSON
// through untouched, it doesn't need to import either language's own type
// to do that).
export interface PersistedCodeOutput {
  execNumber: number
  stdout: string
  stderr: string
  images: string[]
  errorMessage: string | null
}

export interface HtmlSegment {
  type: 'html'
  html: string
}

export interface CodeSegment {
  type: 'code'
  key: string
  language: 'python' | 'javascript'
  // The code block element's own outerHTML, minus its (now unused)
  // `.code-run-controls` placeholder — the syntax-highlighted code itself,
  // ready to render via dangerouslySetInnerHTML same as any other segment.
  codeHtml: string
  code: string
  initialOutput: PersistedCodeOutput | null
  // A ```lang ^block-id cell's tag, if any — read straight off the wrapper
  // element's own `id` attribute (plugin-code-blocks.ts already sets it
  // there when present), so MarkdownReader.tsx's own persistOutput can
  // re-thread it into serializePythonBlock/serializeJavaScriptBlock instead
  // of silently dropping it on every Read-mode run.
  blockId: string | null
  // Line range in the note's raw text (data-src-line/data-src-line-end,
  // plugin-code-blocks.ts) this block occupies — needed to splice a
  // completed run's result back in. Null means "couldn't parse the
  // attribute," treated as "don't attempt to persist" rather than risking
  // a corrupt splice.
  startLine: number | null
  endLine: number | null
}

export type CodeReaderSegment = HtmlSegment | CodeSegment

// MarkdownReader used to portal a live <PythonCodeBlock> into a placeholder
// plugin-python.ts left inside each code block's own markup — but that
// placeholder lived inside the same dangerouslySetInnerHTML subtree as
// everything else in the note, and portaling a live, state-changing React
// component into a node there turned out to cause a genuine infinite loop:
// confirmed via testing (twice, in two related but distinct scenarios)
// that the whole subtree got silently torn down and rebuilt on every
// render once that portal's own state started changing, even when the
// replacement HTML was byte-identical each time. Block.tsx hit the same
// wall earlier and fixed it by rendering its Run panel as a direct sibling
// instead of portaling into raw HTML at all — this function does the
// equivalent for MarkdownReader's whole-document case, which (unlike
// Block.tsx) has no per-block React object to just swap in directly.
//
// Splits the *already-rendered* HTML string (not the raw markdown — see
// MarkdownReader, which computes this via `renderBody(rawBody)` same as
// before) around every top-level runnable code block (any element
// carrying `data-runnable-lang`, emitted by plugin-code-blocks.ts for
// every language in runnable-languages.ts — not tied to one specific CSS
// class, so a future third language needs no change here), so each one
// can be mounted as its own dangerouslySetInnerHTML segment with a real,
// sibling <CodeBlock> next to it instead of nested inside one giant HTML
// blob. Every `data-src-line`/`data-src-line-end` value survives untouched
// (this only repackages *which DOM node* the already-computed HTML lives
// under, it doesn't re-render anything) — critically unlike re-rendering
// each block from its own isolated raw text would, which would reset line
// numbers to be block-relative instead of document-relative and break
// scroll-to-line navigation.
//
// A note with no runnable code blocks at all collapses to exactly one HTML
// segment, identical to the single dangerouslySetInnerHTML this replaces —
// only notes that actually contain a ```python/```javascript fence pay for
// the extra wrapper divs.
export function splitAroundCodeBlocks(html: string): CodeReaderSegment[] {
  const temp = document.createElement('div')
  temp.innerHTML = html

  const segments: CodeReaderSegment[] = []
  let buffer = ''
  let anonymousCount = 0

  for (const child of Array.from(temp.children)) {
    if (!(child instanceof HTMLElement) || child.dataset.runnableLang === undefined) {
      buffer += (child as HTMLElement).outerHTML
      continue
    }

    if (buffer) {
      segments.push({ type: 'html', html: buffer })
      buffer = ''
    }

    child.querySelector('.code-run-controls')?.remove()
    const codeEl = child.querySelector('code')

    let initialOutput: PersistedCodeOutput | null = null
    if (child.dataset.output) {
      try {
        initialOutput = JSON.parse(decodeURIComponent(child.dataset.output)) as PersistedCodeOutput
      } catch {
        // Malformed persisted JSON — treat as "never run" rather than
        // crashing this block's hydration.
      }
    }

    anonymousCount += 1
    segments.push({
      type: 'code',
      // Guaranteed 'python' | 'javascript' by plugin-code-blocks.ts's own
      // controlled emission (runnable-languages.ts only lists those two
      // today) — defaults to 'python' for any unrecognized value rather
      // than dropping the block's content, purely defensive.
      language: child.dataset.runnableLang === 'javascript' ? 'javascript' : 'python',
      key: child.dataset.srcLine ?? `code-${anonymousCount}`,
      codeHtml: child.outerHTML,
      // markdown-it's fence renderer always includes the code's own
      // trailing newline in a fence token's content (the line break that
      // separates the last code line from the closing ``` in the source) —
      // confirmed as a real bug from testing: left in, serializePythonBlock
      // appends its own "\n" before the code fence's closing backticks on
      // top of this one, adding a blank line inside the fence on every
      // Read-mode run, compounding on each subsequent run since the grown
      // code gets read the same way again. Block.tsx's own extraction
      // (a regex over the raw text rather than a rendered element's
      // textContent) doesn't have this problem — the newline right before
      // the closing fence is consumed by the pattern itself, never
      // entering the captured group.
      code: (codeEl?.textContent ?? '').replace(/\n$/, ''),
      initialOutput,
      blockId: child.id || null,
      startLine: child.dataset.srcLine !== undefined ? Number(child.dataset.srcLine) : null,
      endLine: child.dataset.srcLineEnd !== undefined ? Number(child.dataset.srcLineEnd) : null,
    })
  }

  if (buffer) segments.push({ type: 'html', html: buffer })
  return segments
}
