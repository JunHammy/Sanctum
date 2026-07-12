import { serializeTable, padRow, type TableData } from '../lib/table-syntax'
import { useVaultStore } from '../stores/vault.store'

// v1 scope, same decision already made for CSV: an Excel file → a markdown
// table in a new note, reusing table-syntax.ts's own serializer so the
// result opens straight into the visual grid editor. Only the *first*
// sheet — a workbook-wide import (one note per sheet, or a sheet picker)
// is a bigger feature than this needs to be for now; parked until an
// actual multi-sheet file makes that a real problem, not a hypothetical
// one.
//
// `xlsx` here is SheetJS, installed from their own CDN
// (cdn.sheetjs.com/xlsx-0.20.3/...), not the npm registry — the
// npm-published `xlsx` package is stuck on an old version with two real,
// unpatched CVEs (prototype pollution, ReDoS), both fixed upstream but
// never republished to npm. See package.json's dependency entry.
export async function importXlsx(file: File): Promise<string> {
  const XLSX = await import('xlsx')

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) throw new Error('The spreadsheet has no sheets.')
  const sheet = workbook.Sheets[firstSheetName]

  // header: 1 → plain string[][] rows instead of objects keyed by the
  // first row, same shape parseTable/csv-import already work with.
  // raw: false → cells come back as their *displayed* text (respecting
  // the workbook's own number/date formatting), not raw values — a date
  // cell would otherwise come through as a meaningless serial number.
  // defval: '' → a blank cell is an empty string, not undefined, so every
  // row is already a plain string[] with no per-cell null-checking needed.
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
  if (data.length === 0) throw new Error('The sheet has no rows.')

  // Markdown table cells can't contain a literal newline — same flattening
  // csv-import.service.ts already needs for a wrapped-text cell.
  const clean = (cell: unknown) => String(cell ?? '').replace(/\r\n|\r|\n/g, ' ')

  const headers = data[0].map(clean)
  const rows = data.slice(1).map((row) => padRow(row.map(clean), headers.length))

  const table: TableData = { headers, alignments: headers.map(() => null), rows }
  const markdown = serializeTable(table)

  const title = file.name.replace(/\.xlsx?$/i, '').trim() || 'Imported spreadsheet'
  return useVaultStore.getState().createNoteWithContent(title, markdown)
}
