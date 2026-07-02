export interface FileTreeFolder {
  id: string
  name: string
  type: 'folder'
  children: FileTreeNode[]
}

export interface FileTreeFile {
  id: string
  name: string
  type: 'file'
  modifiedTime?: string
}

export interface FileTreeAttachment {
  id: string
  name: string
  type: 'attachment'
  mimeType: string
}

export type FileTreeNode = FileTreeFolder | FileTreeFile | FileTreeAttachment
