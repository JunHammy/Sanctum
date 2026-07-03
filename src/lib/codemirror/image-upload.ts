import { EditorView } from '@codemirror/view'
import { uploadImage } from '../../services/drive.service'
import { useVaultStore } from '../../stores/vault.store'
import { useToastStore } from '../../stores/toast.store'

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
    // Surfaced in the note itself, not just devtools — a silently dropped
    // upload (e.g. an expired auth token mid-flight) previously looked
    // identical to nothing having happened at all. The toast is on top of
    // that, not instead of it — inline text is easy to miss in a long note.
    const insert = `![upload failed: ${file.name}]()`
    view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } })
    useToastStore.getState().show(`Failed to upload "${file.name}"`, 'error')
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
  // Without also claiming dragover, the browser never considers the editor
  // a valid drop target and falls back to its default behavior — navigating
  // the tab to the dropped file instead of handing it to `drop` below.
  dragover(event) {
    event.preventDefault()
    return true
  },

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
