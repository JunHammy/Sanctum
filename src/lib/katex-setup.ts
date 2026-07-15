import { useKatexStore } from '../stores/katex.store'

// Runs as a post-render pass on already-rendered HTML (per MP §6.2), not as
// a markdown-it inline plugin — avoids conflicts between markdown-it's own
// inline parser and $ characters inside code spans/blocks.
//
// Since this operates on HTML (not raw markdown), <pre> and <code> content
// must be protected before running the $ regexes, or a stray "$" inside a
// code block/inline code would get misinterpreted as math delimiters.
const CODE_PROTECT_PATTERN = /<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/g
const BLOCK_MATH_PATTERN = /\$\$([^$]+?)\$\$/g
const INLINE_MATH_PATTERN = /\$([^$\n]+?)\$/g

// A null byte can never occur in real HTML text content, so wrapping the
// index in one is a safe placeholder — unlike plain digits, which could
// plausibly already appear in surrounding note text and cause a wrong swap.
function placeholder(idx: number): string {
  return `\0${idx}\0`
}
// eslint-disable-next-line no-control-regex -- matching the literal null byte is the point, see placeholder()'s own comment
const PLACEHOLDER_PATTERN = /\0(\d+)\0/g

// katex is prefetched (not eagerly bundled) via prefetch-katex.ts, fired
// the moment AppShell mounts — by the time a note's math actually needs
// rendering it's very likely already loaded. This stays synchronous either
// way: if it hasn't arrived yet, the original delimited text is returned
// unchanged (reconstructed from displayMode, since the regex that called
// this already stripped the $ / $$ delimiters) rather than attempting to
// call a module that isn't there — so if this exact string gets rendered
// again later (e.g. AppShell's own self-heal once loadKatex() resolves),
// the same regex still matches it and renders it properly then.
function renderTex(tex: string, displayMode: boolean): string {
  const katex = useKatexStore.getState().module
  if (!katex) return displayMode ? `$$${tex}$$` : `$${tex}$`
  try {
    return katex.renderToString(tex.trim(), { displayMode, throwOnError: false })
  } catch {
    return `<span class="math-error">${tex}</span>`
  }
}

export function renderMath(html: string): string {
  const protectedBlocks: string[] = []
  const withPlaceholders = html.replace(CODE_PROTECT_PATTERN, (match) => {
    protectedBlocks.push(match)
    return placeholder(protectedBlocks.length - 1)
  })

  // Block math ($$...$$) before inline ($...$) — otherwise the inline
  // pattern would eat into a block pair before it's recognized as one.
  let result = withPlaceholders.replace(BLOCK_MATH_PATTERN, (_, tex) => renderTex(tex, true))
  result = result.replace(INLINE_MATH_PATTERN, (_, tex) => renderTex(tex, false))

  return result.replace(PLACEHOLDER_PATTERN, (_, idx) => protectedBlocks[Number(idx)])
}
