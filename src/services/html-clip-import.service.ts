import { useVaultStore } from '../stores/vault.store'

// Imports pasted HTML (from a browser's own copy — selecting content on a
// web page and Ctrl+C puts both text/plain AND text/html on the clipboard
// automatically) as a new note. Simpler than docx import's turndown step:
// a web page's images are already remote URLs, not embedded data, and
// useImageResolution already leaves absolute URLs alone (only vault-
// relative paths get resolved against Drive), so they just render natively
// with no upload step needed.
export async function importHtmlClip(html: string, title: string): Promise<string> {
  const [{ default: TurndownService }, { gfm }] = await Promise.all([import('turndown'), import('turndown-plugin-gfm')])

  // Same options as docx import, for the same reasons — fenced code blocks
  // and a `-` bullet marker match how every other note in the vault looks.
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  }).use(gfm)

  // Confirmed real bug from testing: MediaWiki (Wikipedia and any other
  // wiki using the same math extension) renders LaTeX as a server-generated
  // SVG <img>, with the raw LaTeX source sitting right there as the alt
  // text for accessibility — e.g. alt="{\displaystyle a_{0}b_{0}+...}".
  // Without this rule, turndown's default image handling converts that
  // into a broken markdown image (`![{\displaystyle ...}](svg-url)`) that
  // tries to fetch an SVG and shows garbled escaped LaTeX as alt text
  // instead of rendering as actual math. This rule intercepts those images
  // specifically and emits real $...$/$$...$$ KaTeX syntax instead — using
  // the DOM node's raw alt attribute (not turndown's pre-escaped text),
  // and returning the result directly bypasses turndown's usual
  // underscore-escaping, which would otherwise corrupt LaTeX subscripts.
  turndownService.addRule('mediawikiMath', {
    filter: (node) => node.nodeName === 'IMG' && /^\{\\displaystyle[\s\S]*\}$/.test(node.getAttribute('alt')?.trim() ?? ''),
    replacement: (_content, node) => {
      const alt = node.getAttribute('alt')?.trim() ?? ''
      const latex = alt.replace(/^\{\\displaystyle\s*/, '').replace(/\}$/, '')
      const isDisplay = node.className.includes('display')
      return isDisplay ? `\n\n$$${latex}$$\n\n` : `$${latex}$`
    },
  })

  const markdown = turndownService.turndown(html)

  return useVaultStore.getState().createNoteWithContent(title, markdown)
}
