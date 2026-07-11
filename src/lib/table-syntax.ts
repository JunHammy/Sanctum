// Parser/serializer for GFM pipe-table markdown, backing the visual table
// editor (TableGridEditor.tsx). Modeled on markdown-it's own table block
// rule (rules_block/table.mjs) — escaped-pipe splitting, alignment parsing,
// ragged-row padding — so this never disagrees with how the note actually
// renders. `parseTable(text) !== null` IS the "is this block a table"
// classification check used by Block.tsx; there's deliberately no separate
// regex-based detector, so the grid editor and the detection logic can
// never drift apart from each other.

export type ColumnAlign = 'left' | 'center' | 'right' | null

export interface TableData {
  headers: string[]
  alignments: ColumnAlign[]
  rows: string[][]
}

const SEPARATOR_CELL_PATTERN = /^:?-+:?$/

// Splits a table row on unescaped `|`, un-escaping `\|` to a literal `|` in
// the resulting cell text (serializeTable re-escapes on the way back out —
// callers/editors always see and edit the literal character). Strips a
// single leading/trailing empty cell caused by the row's own optional outer
// pipes (`| a | b |` vs `a | b` are the same 2-column row).
function splitRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') {
      current += '|'
      i += 2
      continue
    }
    if (ch === '|') {
      cells.push(current)
      current = ''
      i += 1
      continue
    }
    current += ch
    i += 1
  }
  cells.push(current)

  const trimmed = cells.map((c) => c.trim())
  if (trimmed.length > 1 && trimmed[0] === '') trimmed.shift()
  if (trimmed.length > 1 && trimmed[trimmed.length - 1] === '') trimmed.pop()
  return trimmed
}

function parseSeparatorRow(line: string, expectedCount: number): ColumnAlign[] | null {
  const cells = splitRow(line)
  if (cells.length !== expectedCount || cells.length === 0) return null

  const alignments: ColumnAlign[] = []
  for (const cell of cells) {
    if (!SEPARATOR_CELL_PATTERN.test(cell)) return null
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) alignments.push('center')
    else if (right) alignments.push('right')
    else if (left) alignments.push('left')
    // Bare `---`, GFM's actual default — a genuinely different token from
    // an explicit `:---`. Kept as null (not collapsed into 'left') so a
    // table nobody has explicitly aligned doesn't get its separator row
    // silently rewritten the first time anything else about it is edited.
    else alignments.push(null)
  }
  return alignments
}

function padRow(cells: string[], length: number): string[] {
  // Ragged rows get padded with empty cells (or truncated if too long) —
  // inherited GFM behavior, not a choice to "fix": this is exactly what
  // markdown-it's own renderer already does for the same source today.
  const padded = cells.slice(0, length)
  while (padded.length < length) padded.push('')
  return padded
}

export function parseTable(rawText: string): TableData | null {
  // Tolerate trailing blank lines (the extremely common "finished the last
  // row, pressed Enter, haven't typed anything new yet" mid-editing state)
  // but nothing else — an internal blank line, or content after the table
  // that doesn't itself look like a table row, means this block isn't
  // purely a table anymore and parsing bails out entirely rather than
  // silently discarding whatever that extra content is.
  const trimmed = rawText.replace(/\n+$/, '')
  if (!trimmed.trim()) return null

  const lines = trimmed.split('\n')
  if (lines.length < 2) return null
  // A 4+ space indent would make this an indented code block under
  // CommonMark/GFM, not a table — split-blocks.ts's real tokenizer would
  // never have classified one as a table_open in the first place, so this
  // guard just keeps this hand-rolled parser's notion of "table" aligned
  // with the actual renderer's for the one path where rawText is examined
  // fresh while the user is actively typing.
  if (/^ {4,}/.test(lines[0])) return null
  if (!lines[0].includes('|')) return null

  const headers = splitRow(lines[0])
  if (headers.length === 0) return null

  const alignments = parseSeparatorRow(lines[1], headers.length)
  if (!alignments) return null

  const rows: string[][] = []
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') return null
    rows.push(padRow(splitRow(line), headers.length))
  }

  return { headers, alignments, rows }
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|')
}

function padCell(text: string, width: number, align: ColumnAlign): string {
  const pad = width - text.length
  if (pad <= 0) return text
  if (align === 'right') return ' '.repeat(pad) + text
  if (align === 'center') {
    const left = Math.floor(pad / 2)
    return ' '.repeat(left) + text + ' '.repeat(pad - left)
  }
  return text + ' '.repeat(pad) // left, or no explicit alignment
}

function buildSeparatorCell(align: ColumnAlign, width: number): string {
  if (align === 'center') return `:${'-'.repeat(width - 2)}:`
  if (align === 'right') return `${'-'.repeat(width - 1)}:`
  if (align === 'left') return `:${'-'.repeat(width - 1)}`
  return '-'.repeat(width)
}

// Pretty-aligns/pads columns rather than emitting compact output —
// idempotent (re-serializing an already-normalized table is byte-
// identical, so repeated edits don't produce escalating diff noise),
// matches what a human author or Obsidian/Prettier's markdown formatter
// would produce, and follows the same "regenerate a normalized block
// wholesale on edit" precedent serializeFrontmatter() already established
// elsewhere in this codebase. Only tables actually edited through the grid
// ever get reformatted this way — a table nobody has touched keeps its
// original hand-written layout untouched, since this function is only ever
// called from an onChange, never speculatively.
export function serializeTable(table: TableData): string {
  const { headers, alignments, rows } = table
  const escapedHeaders = headers.map(escapeCell)
  const escapedRows = rows.map((row) => row.map(escapeCell))

  const widths = escapedHeaders.map((header, c) => {
    let width = Math.max(header.length, 3)
    for (const row of escapedRows) width = Math.max(width, row[c]?.length ?? 0)
    return width
  })

  function buildRow(cells: string[]): string {
    const padded = cells.map((cell, c) => padCell(cell, widths[c], alignments[c]))
    return `| ${padded.join(' | ')} |`
  }

  const headerLine = buildRow(escapedHeaders)
  const separatorLine = `| ${widths.map((w, c) => buildSeparatorCell(alignments[c], w)).join(' | ')} |`
  const bodyLines = escapedRows.map(buildRow)

  return [headerLine, separatorLine, ...bodyLines].join('\n')
}
