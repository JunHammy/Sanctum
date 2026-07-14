// Splits a fence's info string (the text after the opening ``` and language)
// into the language itself and an optional trailing `^block-id` — same
// pattern shape as plugin-block-id.ts's own BLOCK_ID_PATTERN, applied here
// to fence info strings instead of paragraph/list-item text. A standalone
// module (not living in runnable-languages.ts) specifically to avoid a
// circular import: runnable-languages.ts already imports PYTHON_LANG/JS_LANG
// from python-syntax.ts/javascript-syntax.ts, and those two files need this
// helper too.
const FENCE_BLOCK_ID_PATTERN = /\s\^([a-zA-Z0-9_-]+)\s*$/

export interface ParsedFenceInfo {
  lang: string
  blockId: string | null
}

export function parseFenceInfo(info: string): ParsedFenceInfo {
  const trimmed = info.trim()
  const match = FENCE_BLOCK_ID_PATTERN.exec(trimmed)
  return {
    lang: (match ? trimmed.slice(0, match.index) : trimmed).toLowerCase(),
    blockId: match ? match[1] : null,
  }
}
