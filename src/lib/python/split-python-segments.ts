import type { PersistedPythonOutput } from './python-syntax'

export interface HtmlSegment {
  type: 'html'
  html: string
}

export interface PythonSegment {
  type: 'python'
  key: string
  // The `.python-block` element's own outerHTML, minus its (now unused)
  // `.python-run-controls` placeholder — the syntax-highlighted code itself,
  // ready to render via dangerouslySetInnerHTML same as any other segment.
  codeHtml: string
  code: string
  initialOutput: PersistedPythonOutput | null
  // Line range in the note's raw text (data-src-line/data-src-line-end,
  // plugin-python.ts) this block occupies — needed to splice a completed
  // run's result back in. Null means "couldn't parse the attribute,"
  // treated as "don't attempt to persist" rather than risking a corrupt
  // splice.
  startLine: number | null
  endLine: number | null
}

export type PythonReaderSegment = HtmlSegment | PythonSegment

// MarkdownReader used to portal a live <PythonCodeBlock> into the
// `.python-run-controls` placeholder plugin-python.ts leaves inside each
// `.python-block`'s own markup — but that placeholder lives inside the same
// dangerouslySetInnerHTML subtree as everything else in the note, and
// portaling a live, state-changing React component into a node there turned
// out to cause a genuine infinite loop: confirmed via testing (twice, in two
// related but distinct scenarios) that the whole subtree got silently torn
// down and rebuilt on every render once that portal's own state started
// changing, even when the replacement HTML was byte-identical each time.
// Block.tsx hit the same wall earlier this session and fixed it by
// rendering its Run panel as a direct sibling instead of portaling into raw
// HTML at all — this function does the equivalent for MarkdownReader's
// whole-document case, which (unlike Block.tsx) has no per-block React
// object to just swap in directly.
//
// Splits the *already-rendered* HTML string (not the raw markdown — see
// MarkdownReader, which computes this via `renderBody(rawBody)` same as
// before) around every top-level `.python-block`, so each one can be
// mounted as its own dangerouslySetInnerHTML segment with a real, sibling
// <PythonCodeBlock> next to it instead of nested inside one giant HTML
// blob. Every `data-src-line`/`data-src-line-end` value survives untouched
// (this only repackages *which DOM node* the already-computed HTML lives
// under, it doesn't re-render anything) — critically unlike re-rendering
// each block from its own isolated raw text would, which would reset line
// numbers to be block-relative instead of document-relative and break
// scroll-to-line navigation.
//
// A note with no python blocks at all collapses to exactly one HTML
// segment, identical to the single dangerouslySetInnerHTML this replaces —
// only notes that actually contain a ```python fence pay for the extra
// wrapper divs.
export function splitAroundPythonBlocks(html: string): PythonReaderSegment[] {
  const temp = document.createElement('div')
  temp.innerHTML = html

  const segments: PythonReaderSegment[] = []
  let buffer = ''
  let anonymousCount = 0

  for (const child of Array.from(temp.children)) {
    if (!(child instanceof HTMLElement) || !child.classList.contains('python-block')) {
      buffer += (child as HTMLElement).outerHTML
      continue
    }

    if (buffer) {
      segments.push({ type: 'html', html: buffer })
      buffer = ''
    }

    child.querySelector('.python-run-controls')?.remove()
    const codeEl = child.querySelector('code')

    let initialOutput: PersistedPythonOutput | null = null
    if (child.dataset.output) {
      try {
        initialOutput = JSON.parse(decodeURIComponent(child.dataset.output)) as PersistedPythonOutput
      } catch {
        // Malformed persisted JSON — treat as "never run" rather than
        // crashing this block's hydration.
      }
    }

    anonymousCount += 1
    segments.push({
      type: 'python',
      key: child.dataset.srcLine ?? `python-${anonymousCount}`,
      codeHtml: child.outerHTML,
      // markdown-it's fence renderer always includes the code's own
      // trailing newline in a fence token's content (the line break that
      // separates the last code line from the closing ``` in the source) —
      // confirmed as a real bug from testing: left in, serializePythonBlock
      // appends its own "\n" before the code fence's closing backticks on
      // top of this one, adding a blank line inside the fence on every
      // Read-mode run, compounding on each subsequent run since the grown
      // code gets read the same way again. Block.tsx's own extraction
      // (python-syntax.ts's parsePythonBlock, a regex over the raw text
      // rather than a rendered element's textContent) doesn't have this
      // problem — the newline right before the closing fence is consumed
      // by the pattern itself, never entering the captured group.
      code: (codeEl?.textContent ?? '').replace(/\n$/, ''),
      initialOutput,
      startLine: child.dataset.srcLine !== undefined ? Number(child.dataset.srcLine) : null,
      endLine: child.dataset.srcLineEnd !== undefined ? Number(child.dataset.srcLineEnd) : null,
    })
  }

  if (buffer) segments.push({ type: 'html', html: buffer })
  return segments
}
