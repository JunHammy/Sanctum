import { parseFenceInfo } from '../fence-info'

// JavaScript's own counterpart to python-syntax.ts — deliberately a
// separate, self-contained file rather than a shared/parameterized module:
// python-syntax.ts is heavily exercised, tested code, and duplicating this
// small, pure, stateless surface avoids any risk of a generalization bug
// touching the already-working Python path. See code-worker-protocol.ts's
// own comment for the same reasoning applied to the worker message shapes.
export const JS_LANG = 'javascript'
export const JS_OUTPUT_LANG = 'javascript-output'

// Structurally identical to python-syntax.ts's PersistedPythonOutput —
// declared fresh here rather than importing that one, since the two
// languages' persistence formats are only *coincidentally* the same shape
// today, not something that needs to be kept in lockstep by a shared type.
// `images` is always `[]` for JS (js.worker.ts never captures any — no
// document/canvas exists inside a Worker), but keeping the field lets
// CodeBlock.tsx's rendering stay entirely language-agnostic.
export interface PersistedJsOutput {
  execNumber: number
  stdout: string
  stderr: string
  images: string[]
  errorMessage: string | null
}

// The opening line's info string is captured whole (not hardcoded to just
// `javascript`) so a `^block-id` suffix (see fence-info.ts) can still match
// — parseFenceInfo below is what actually checks the language.
const JS_FENCE_PATTERN = /^```([^\n]*)\r?\n([\s\S]*?)\r?\n?```/

export function parseJavaScriptBlock(rawText: string): string | null {
  const match = JS_FENCE_PATTERN.exec(rawText.trim())
  if (match === null) return null
  if (parseFenceInfo(match[1]).lang !== JS_LANG) return null
  return match[2]
}

// A tagged cell's `^block-id`, if any — e.g. from ` ```javascript ^my-cell `.
// Kept separate from parseJavaScriptBlock rather than folded into its return
// value, so every existing `parsedJavaScript !== null` check in Block.tsx
// stays exactly as it is.
export function parseJavaScriptBlockId(rawText: string): string | null {
  const match = JS_FENCE_PATTERN.exec(rawText.trim())
  if (match === null || parseFenceInfo(match[1]).lang !== JS_LANG) return null
  return parseFenceInfo(match[1]).blockId
}

const PERSISTED_OUTPUT_PATTERN = /```javascript-output\r?\n([\s\S]*?)\r?\n?```\s*$/

export function parseJsPersistedOutput(rawText: string): PersistedJsOutput | null {
  const match = PERSISTED_OUTPUT_PATTERN.exec(rawText.trim())
  if (match === null) return null
  try {
    return JSON.parse(match[1]) as PersistedJsOutput
  } catch {
    return null
  }
}

// blockId is optional and re-emitted on the opening fence line when present
// — see serializePythonBlock's own comment for why this matters on every
// keystroke, not just after a Run.
export function serializeJavaScriptBlock(code: string, output: PersistedJsOutput | null, blockId?: string | null): string {
  const codeFence = '```javascript' + (blockId ? ' ^' + blockId : '') + '\n' + code + '\n```'
  if (!output) return codeFence
  return codeFence + '\n```javascript-output\n' + JSON.stringify(output, null, 2) + '\n```'
}
