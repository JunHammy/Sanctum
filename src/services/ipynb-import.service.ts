import { useVaultStore } from '../stores/vault.store'
import { serializePythonBlock, type PersistedPythonOutput } from '../lib/python/python-syntax'

// Minimal slice of the Jupyter nbformat v4 spec — only the fields this
// converter actually reads. `source` is commonly an array of lines (each
// already carrying its own trailing \n) but some tools write a single
// string instead — both are handled by joinSource below.
interface NbCell {
  cell_type: 'markdown' | 'code' | 'raw'
  source?: string | string[]
  outputs?: NbOutput[]
  execution_count?: number | null
}

interface NbOutput {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error'
  name?: 'stdout' | 'stderr'
  text?: string | string[]
  data?: Record<string, string | string[]>
  ename?: string
  evalue?: string
  traceback?: string[]
}

interface NbNotebook {
  cells: NbCell[]
}

function joinSource(source: string | string[] | undefined): string {
  if (!source) return ''
  return Array.isArray(source) ? source.join('') : source
}

// Real Jupyter tracebacks carry ANSI color codes (terminal-style bold red
// for the exception type, etc.) — meaningless once copied into a plain
// markdown code fence, so stripped rather than left as garbage \x1b[...m
// sequences in the persisted error text.
// eslint-disable-next-line no-control-regex -- matching the literal ESC byte is the point, see comment above
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g

// Maps every ipynb output_type this converter supports onto Sanctum's own
// PersistedPythonOutput shape (see python-syntax.ts) — same shape a live
// Pyodide run already produces, so an imported cell renders through the
// exact same PythonCodeBlock/MarkdownReader pipeline with no new rendering
// code needed. A cell with no outputs at all (never run, or genuinely
// empty) returns null, matching how an un-run block looks natively — no
// ```python-output fence gets written for it.
function convertOutputs(cell: NbCell, execNumber: number): PersistedPythonOutput | null {
  let stdout = ''
  let stderr = ''
  const images: string[] = []
  let errorMessage: string | null = null

  for (const output of cell.outputs ?? []) {
    if (output.output_type === 'stream') {
      const text = joinSource(output.text)
      if (output.name === 'stderr') stderr += text
      else stdout += text
    } else if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
      // image/png in nbformat is already raw base64, no data: URI prefix —
      // the exact same format Pyodide's own matplotlib capture produces
      // (pyodide.worker.ts), so it's used as-is.
      const png = output.data?.['image/png']
      if (png) {
        images.push(joinSource(png))
      } else {
        const text = output.data?.['text/plain']
        if (text) stdout += joinSource(text)
      }
    } else if (output.output_type === 'error') {
      const traceback = (output.traceback ?? []).map((line) => line.replace(ANSI_PATTERN, '')).join('\n')
      errorMessage = traceback || `${output.ename}: ${output.evalue}`
    }
  }

  if (!stdout && !stderr && images.length === 0 && !errorMessage) return null
  return { execNumber: cell.execution_count ?? execNumber, stdout, stderr, images, errorMessage }
}

// Imports a .ipynb file as a new note: markdown cells become plain markdown,
// code cells become ```python blocks with their outputs carried over as a
// persisted ```python-output fence (same format a live Run produces) —
// deliberately a one-time converter, not native .ipynb file support (a
// second file format to maintain in the vault tree/Drive sync/search
// indexing forever isn't worth it once the notebook lives in the vault as
// a normal, searchable/linkable note). Raw cells are skipped — no clear
// rendering target in Sanctum. Uses the same reactive-insert path
// createNote/importDocx already use, so the sidebar updates immediately.
export async function importIpynb(file: File): Promise<string> {
  const text = await file.text()
  let notebook: NbNotebook
  try {
    notebook = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON — is it really a Jupyter notebook?')
  }
  if (!Array.isArray(notebook.cells)) {
    throw new Error('This file has no notebook cells to import.')
  }

  const segments: string[] = []
  let execNumber = 0
  for (const cell of notebook.cells) {
    if (cell.cell_type === 'markdown') {
      const markdown = joinSource(cell.source).trim()
      if (markdown) segments.push(markdown)
    } else if (cell.cell_type === 'code') {
      const code = joinSource(cell.source)
      if (!code.trim() && (!cell.outputs || cell.outputs.length === 0)) continue // skip a genuinely empty cell
      execNumber++
      segments.push(serializePythonBlock(code, convertOutputs(cell, execNumber)))
    }
  }

  const title = file.name.replace(/\.ipynb$/i, '').trim() || 'Imported notebook'
  return useVaultStore.getState().createNoteWithContent(title, segments.join('\n\n'))
}
