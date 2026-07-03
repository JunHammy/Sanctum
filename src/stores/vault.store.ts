import { create } from 'zustand'
import * as driveService from '../services/drive.service'
import { useSearchStore } from './search.store'
import type { DriveFile } from '../lib/drive-api'
import type { FileTreeNode } from '../types/vault.types'

interface VaultState {
  rootFolderId: string | null
  fileTree: FileTreeNode[]
  isLoading: boolean
  error: string | null
  loadVault: () => Promise<void>
  createNote: (name: string) => Promise<string>
  createFolder: (name: string) => Promise<void>
  moveNote: (fileId: string, newParentId: string, oldParentId: string) => Promise<void>
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

function buildFileTree(files: DriveFile[], rootId: string): FileTreeNode[] {
  const childrenByParent = new Map<string, DriveFile[]>()
  for (const file of files) {
    const parentId = file.parents?.[0]
    if (!parentId) continue
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(file)
    childrenByParent.set(parentId, siblings)
  }

  function build(parentId: string): FileTreeNode[] {
    const children = childrenByParent.get(parentId) ?? []
    const nodes: FileTreeNode[] = []

    for (const item of children) {
      if (item.mimeType === FOLDER_MIME) {
        if (item.name === '.vault') continue // hidden config folder, MP §7
        nodes.push({ id: item.id, name: item.name, type: 'folder', children: build(item.id) })
      } else if (item.name.endsWith('.md')) {
        nodes.push({ id: item.id, name: item.name, type: 'file', modifiedTime: item.modifiedTime })
      } else {
        nodes.push({ id: item.id, name: item.name, type: 'attachment', mimeType: item.mimeType })
      }
    }

    return nodes.sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1
      if (a.type !== 'folder' && b.type === 'folder') return 1
      return a.name.localeCompare(b.name)
    })
  }

  return build(rootId)
}

export const useVaultStore = create<VaultState>()((set, get) => ({
  rootFolderId: null,
  fileTree: [],
  isLoading: false,
  error: null,

  loadVault: async () => {
    set({ isLoading: true, error: null })
    try {
      const root = await driveService.findOrCreateVaultFolder()
      const files = await driveService.listAllFiles()
      const fileTree = buildFileTree(files, root.id)
      set({ rootFolderId: root.id, fileTree, isLoading: false })
      // Fire-and-forget — indexing note bodies for search shouldn't block
      // the sidebar from rendering the tree it already has.
      useSearchStore.getState().buildIndex(fileTree)
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load vault' })
    }
  },

  createNote: async (name) => {
    const filename = name.endsWith('.md') ? name : `${name}.md`
    const title = name.replace(/\.md$/, '')
    const today = new Date().toISOString().slice(0, 10)
    const content = `---\ntitle: ${title}\ncreated: ${today}\n---\n\n# ${title}\n`

    const file = await driveService.createNote(filename, content)
    await get().loadVault()
    return file.id
  },

  createFolder: async (name) => {
    await driveService.createFolder(name)
    await get().loadVault()
  },

  moveNote: async (fileId, newParentId, oldParentId) => {
    await driveService.moveFile(fileId, newParentId, oldParentId)
    await get().loadVault()
  },
}))
