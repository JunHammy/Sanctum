// Whole-block detection: the entire block must be exactly one $$...$$ span
// (with only whitespace outside it) — mirrors table-syntax.ts's parseTable,
// which Block.tsx uses the exact same way to decide whether to swap in a
// dedicated visual editor instead of the plain text one. Deliberately does
// NOT match inline $...$ math scattered through prose — that has a
// completely different editing surface (a CodeMirror live-preview widget,
// see custom-syntax-decorations.ts), not a whole-block swap.
const BLOCK_MATH_PATTERN = /^\$\$([\s\S]*)\$\$$/

export function parseMathBlock(rawText: string): string | null {
  const match = BLOCK_MATH_PATTERN.exec(rawText.trim())
  if (match === null) return null
  return match[1].trim()
}

// MathLive's <math-field> is already implicitly "in math mode" — pasting
// text that still has its $$...$$ or $...$ markdown delimiters (e.g.
// copied from a rendered note, or from this very page's own examples)
// isn't LaTeX MathLive knows to unwrap; the $ characters would just get
// inserted as literal, meaningless symbols. Strips exactly one matching
// pair if the *whole* pasted string is wrapped in one, leaving anything
// else (plain LaTeX with no delimiters, which is the common case, or text
// that merely contains a $ without being wrapped by one) untouched.
export function stripMathDelimiters(text: string): string {
  const trimmed = text.trim()
  const block = /^\$\$([\s\S]*)\$\$$/.exec(trimmed)
  if (block) return block[1].trim()
  const inline = /^\$([^$]*)\$$/.exec(trimmed)
  if (inline) return inline[1].trim()
  return text
}

export function serializeMathBlock(latex: string): string {
  const trimmed = latex.trim()
  // Confirmed real bug from testing: for empty content, `$$\n\n$$` puts a
  // *blank line* between the delimiters — and a blank line always breaks a
  // CommonMark paragraph. Read mode renders a block's rawText in
  // isolation (renderBody(block.rawText)), so markdown-it split this into
  // two separate <p> tags, and the $$...$$ regex in katex-setup.ts then
  // spanned across that tag boundary, feeding the HTML in between
  // (</p><p data-src-line="N">) to KaTeX as if it were the equation's
  // LaTeX — which is exactly the garbled "</p><pdata-src-line=..." output
  // an empty equation rendered as. No blank line, no split.
  return trimmed ? `$$\n${trimmed}\n$$` : '$$\n$$'
}
