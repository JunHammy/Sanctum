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
