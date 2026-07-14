import { useVaultStore } from '../stores/vault.store'

// Unlike docx/csv/xlsx/ipynb, there's no conversion step here at all — a
// .md file already *is* Sanctum's own note format, so this just reads its
// text and uploads it as a new note via the same reactive-insert path
// createNote/importDocx already use (sidebar updates immediately, search/
// backlink/tag indexing runs right away). Exists mainly to reduce friction:
// without it, getting a hand-written .md file into the vault meant leaving
// Sanctum entirely to upload it via Drive's own UI — a real, if small, gap
// once every *other* supported format had a one-click import right here.
export async function importMarkdown(file: File): Promise<string> {
  const content = await file.text()
  const title = file.name.replace(/\.md$/i, '').trim() || 'Imported note'
  return useVaultStore.getState().createNoteWithContent(title, content)
}
