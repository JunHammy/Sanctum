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
  const markdown = turndownService.turndown(html)

  return useVaultStore.getState().createNoteWithContent(title, markdown)
}
