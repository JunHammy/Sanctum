import { parseFenceInfo } from '../fence-info'

// Fence-language literals — re-exported by runnable-languages.ts (the
// shared table split-blocks.ts's merging and plugin-code-blocks.ts's
// rendering both key off of) so there's exactly one place either string
// could typo/drift, not three.
export const PYTHON_LANG = 'python'
export const PYTHON_OUTPUT_LANG = 'python-output'

// A persisted run's result, written back into the note's own markdown text
// (see serializePythonBlock below) so it survives a reload instead of
// living only in python-kernel.store's in-memory, per-session state.
// Deliberately omits `status`/`loadingPackage` — those are live-execution-
// only concerns; a persisted output is inherently already-finished, and
// `errorMessage` being set vs. not is enough to tell success from error.
// `execNumber` is kept even though it's a per-session counter — the same
// "can look out of order after a partial rerun" caveat real Jupyter/ipynb
// notebooks already have with their own `execution_count`, not something
// worth solving here.
export interface PersistedPythonOutput {
  execNumber: number
  stdout: string
  stderr: string
  images: string[]
  errorMessage: string | null
}

// Whole-block detection, same convention as math-syntax.ts's parseMathBlock
// and table-syntax.ts's parseTable: a block counts as "a python block" if it
// *starts* with one ```python fence. No longer anchored at the very end
// (unlike parseMathBlock/parseTable) — a block may also carry a persisted
// ```python-output fence immediately after this one (see
// parsePersistedOutput below); that trailing content is that function's
// concern, not this one's. The optional `\r?\n?` before the closing fence
// mirrors this pattern's original leniency (tolerates a fence closed with
// no blank line before it, e.g. an empty `/python` snippet).
//
// The opening line's info string is captured whole (not hardcoded to just
// `python`) so a `^block-id` suffix (see fence-info.ts) can still match —
// parseFenceInfo below is what actually checks the language.
const PYTHON_FENCE_PATTERN = /^```([^\n]*)\r?\n([\s\S]*?)\r?\n?```/

export function parsePythonBlock(rawText: string): string | null {
  const match = PYTHON_FENCE_PATTERN.exec(rawText.trim())
  if (match === null) return null
  if (parseFenceInfo(match[1]).lang !== PYTHON_LANG) return null
  return match[2]
}

// A tagged cell's `^block-id`, if any — e.g. from ` ```python ^intro-imports `.
// Kept separate from parsePythonBlock rather than folded into its return
// value, so every existing `parsedPython !== null` check in Block.tsx stays
// exactly as it is.
export function parsePythonBlockId(rawText: string): string | null {
  const match = PYTHON_FENCE_PATTERN.exec(rawText.trim())
  if (match === null || parseFenceInfo(match[1]).lang !== PYTHON_LANG) return null
  return parseFenceInfo(match[1]).blockId
}

// Matches a ```python-output fence anchored to the very end of the block's
// text — split-blocks.ts only ever merges one of these onto a block when
// it's immediately adjacent (no blank line) to that block's own ```python
// fence, so "at the end" is always where it lives when present at all.
const PERSISTED_OUTPUT_PATTERN = /```python-output\r?\n([\s\S]*?)\r?\n?```\s*$/

export function parsePersistedOutput(rawText: string): PersistedPythonOutput | null {
  const match = PERSISTED_OUTPUT_PATTERN.exec(rawText.trim())
  if (match === null) return null
  try {
    return JSON.parse(match[1]) as PersistedPythonOutput
  } catch {
    // Malformed JSON (hand-edited or corrupted) — treat as "no persisted
    // output" rather than crashing the whole block's render.
    return null
  }
}

// Inverse of parsePythonBlock + parsePersistedOutput combined — the single
// place that reconstructs a block's full rawText after a run completes.
// Pretty-printed JSON (not single-line) matches this codebase's existing
// "regenerate a readable, normalized form" convention (serializeFrontmatter,
// serializeTable). blockId is optional and re-emitted on the opening fence
// line when present — Block.tsx calls this on every keystroke in the code
// editor, so if this ever stopped re-attaching a tagged cell's id, the very
// next keystroke after tagging a cell would silently untag it.
export function serializePythonBlock(code: string, output: PersistedPythonOutput | null, blockId?: string | null): string {
  const codeFence = '```python' + (blockId ? ' ^' + blockId : '') + '\n' + code + '\n```'
  if (!output) return codeFence
  return codeFence + '\n```python-output\n' + JSON.stringify(output, null, 2) + '\n```'
}
