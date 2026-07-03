import { EditorView } from '@codemirror/view'
import { uploadImage } from '../../services/drive.service'
import { useVaultStore } from '../../stores/vault.store'

// Pasting/dropping an image uploads it to the vault's assets/ folder and
// inserts a markdown image reference at the cursor. Lives at the CodeMirror
// layer (not Block/BlockEditor) since that's where cursor position and text
// insertion naturally happen — same view.dispatch() pattern already used
// for slash-command snippet insertion.
async function handleImageFile(file: File, view: EditorView, pos: number) {
  try {
    const filename = await uploadImage(file)
    const insert = `![${file.name}](${filename})`
    view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } })
    // The just-uploaded attachment isn't in vault.store's fileTree yet (a
    // separate, stale snapshot) — image resolution searches that tree by
    // filename, so without this refresh the new image wouldn't display
    // until a manual sidebar refresh.
    useVaultStore.getState().loadVault()
  } catch (err) {
    console.error('Image upload failed:', err)
  }
}

function firstImageFile(files: FileList | null): File | null {
  if (!files) return null
  for (const file of files) {
    if (file.type.startsWith('image/')) return file
  }
  return null
}

export const imageUploadExtension = EditorView.domEventHandlers({
  paste(event, view) {
    const items = event.clipboardData?.items
    if (!items) return false

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (!file) continue
        event.preventDefault()
        handleImageFile(file, view, view.state.selection.main.head)
        return true
      }
    }
    return false
  },

  drop(event, view) {
    const file = firstImageFile(event.dataTransfer?.files ?? null)
    if (!file) return false

    event.preventDefault()
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
    handleImageFile(file, view, pos)
    return true
  },
})
