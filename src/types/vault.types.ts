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
  // Drive `properties.starred` custom property (see vault.store.ts's
  // buildFileTree/toggleStarred and drive-api.ts's setFileStarred) — a
  // leaf-item concept, so folders never carry this field.
  starred?: boolean
}

export interface FileTreeAttachment {
  id: string
  name: string
  type: 'attachment'
  mimeType: string
  order?: number
  starred?: boolean
}

export type FileTreeNode = FileTreeFolder | FileTreeFile | FileTreeAttachment
