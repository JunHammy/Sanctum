export interface FileTreeFolder {
  id: string
  name: string
  type: 'folder'
  children: FileTreeNode[]
  // Fractional-index sort key for manual drag-reorder — see vault.store.ts's
  // sortNodes/reorderNode. Absent until the item is first dragged; sorts
  // alphabetically among other unordered siblings until then.
  order?: number
}

export interface FileTreeFile {
  id: string
  name: string
  type: 'file'
  modifiedTime?: string
  order?: number
}

export interface FileTreeAttachment {
  id: string
  name: string
  type: 'attachment'
  mimeType: string
  order?: number
}

export type FileTreeNode = FileTreeFolder | FileTreeFile | FileTreeAttachment
