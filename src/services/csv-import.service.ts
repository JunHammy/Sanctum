import { serializeTable, padRow, type TableData } from '../lib/table-syntax'
import { useVaultStore } from '../stores/vault.store'

// v1 scope, decided ahead of time: CSV → a markdown table in a new note.
// Feeding a Plotly/Chart.js block directly from CSV data is a separate,
// bigger feature (real chart-config decisions — what to plot, which axes),
// not this one. Same "lazy-load a parser, wire into the sidebar import
// menu, toastPromise feedback" template docx import already established.
export async function importCsv(file: File): Promise<string> {
  const { default: Papa } = await import('papaparse')

  const text = await file.text()
  // header: false (Papaparse's default) — returns plain string[][] rather
  // than objects keyed by the first row, since the first row is handled
  // explicitly below as the table's headers, same shape parseTable already
  // works with.
  const { data } = Papa.parse<string[]>(text, { skipEmptyLines: true })
  if (data.length === 0) throw new Error('The CSV file has no rows.')

  // Markdown table cells can't contain a literal newline (it would break
  // the one-row-per-line format) — CSV's own quoting rules allow embedded
  // newlines inside a field, so those need flattening the same way a
  // pasted multi-line cell already gets flattened in the grid editor.
  const clean = (cell: string) => cell.replace(/\r\n|\r|\n/g, ' ')

  const headers = data[0].map(clean)
  const rows = data.slice(1).map((row) => padRow(row.map(clean), headers.length))

  const table: TableData = { headers, alignments: headers.map(() => null), rows }
  const markdown = serializeTable(table)

  const title = file.name.replace(/\.csv$/i, '').trim() || 'Imported CSV'
  return useVaultStore.getState().createNoteWithContent(title, markdown)
}
