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

const JS_FENCE_PATTERN = /^```javascript\r?\n([\s\S]*?)\r?\n?```/

export function parseJavaScriptBlock(rawText: string): string | null {
  const match = JS_FENCE_PATTERN.exec(rawText.trim())
  if (match === null) return null
  return match[1]
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

export function serializeJavaScriptBlock(code: string, output: PersistedJsOutput | null): string {
  const codeFence = '```javascript\n' + code + '\n```'
  if (!output) return codeFence
  return codeFence + '\n```javascript-output\n' + JSON.stringify(output, null, 2) + '\n```'
}
