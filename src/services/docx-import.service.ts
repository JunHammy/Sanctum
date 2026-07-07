import { findOrCreateAssetsFolder, uploadAttachment } from './drive.service'
import { useVaultStore } from '../stores/vault.store'

// mammoth's own Image type isn't exported as a standalone named type — this
// covers just the one method actually used here (readAsArrayBuffer).
interface MammothImage {
  contentType: string
  readAsArrayBuffer: () => Promise<ArrayBuffer>
}

function extensionFor(contentType: string): string {
  // "image/svg+xml" → "svg", not "svg+xml" — the +xml suffix is a real
  // part of the MIME type but not of a usable file extension.
  return contentType.split('/')[1]?.split('+')[0] || 'png'
}

// Called once per embedded image as mammoth walks the document — uploads
// it to the vault's assets/ folder immediately and points mammoth's own
// HTML output at the uploaded filename, so the note's markdown ends up
// with a normal `![](filename.png)` referencing a real Drive attachment,
// the same as an image pasted directly into the editor — not a giant
// inline base64 data URI (mammoth's own default) sitting in the note body.
async function uploadMammothImage(image: MammothImage, assetsFolderId: string): Promise<{ src: string }> {
  const buffer = await image.readAsArrayBuffer()
  const filename = `docx-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(image.contentType)}`
  await uploadAttachment(assetsFolderId, filename, new Blob([buffer], { type: image.contentType }))
  return { src: filename }
}

// Imports a .docx file as a new note: mammoth converts the document to
// HTML (real structure — headings, bold/italic, lists, tables all come
// through, unlike a plain text extraction), turndown converts that HTML to
// markdown, and the result is created as a normal note via the same
// reactive-insert path createNote uses (sidebar updates immediately, no
// full vault reload/folder-collapse flash).
export async function importDocx(file: File): Promise<string> {
  const [{ default: mammoth }, { default: TurndownService }, { gfm }] = await Promise.all([
    import('mammoth'),
    import('turndown'),
    import('turndown-plugin-gfm'),
  ])

  const arrayBuffer = await file.arrayBuffer()
  const assetsFolder = await findOrCreateAssetsFolder()

  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer },
    { convertImage: mammoth.images.imgElement((image) => uploadMammothImage(image, assetsFolder.id)) },
  )

  // fenced code blocks (```) rather than turndown's indented-4-spaces
  // default — matches how every code block already looks in a Sanctum note
  // written by hand, and survives copy/paste much better. bulletListMarker
  // likewise matches Sanctum's own convention (`-`) rather than turndown's
  // own default (`*`) — cosmetic, but keeps an imported note's raw
  // markdown looking consistent with everything else in the vault.
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  }).use(gfm)
  const markdown = turndownService.turndown(html)

  const title = file.name.replace(/\.docx$/i, '').trim() || 'Imported document'
  return useVaultStore.getState().createNoteWithContent(title, markdown)
}
