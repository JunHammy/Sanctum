import { create } from 'zustand'
import * as driveService from '../services/drive.service'
import { useSearchStore } from './search.store'
import { useBacklinksStore } from './backlinks.store'
import { useTagsStore } from './tags.store'
import { useToastStore } from './toast.store'
import { toUserMessage, logError } from '../lib/error-messages'
import type { DriveFile } from '../lib/drive-api'
import type { FileTreeNode } from '../types/vault.types'

interface VaultState {
  rootFolderId: string | null
  fileTree: FileTreeNode[]
  isLoading: boolean
  error: string | null
  loadVault: () => Promise<void>
  createNote: (name: string) => Promise<string>
  // Same reactive-insert path as createNote, but for a caller that already
  // has a full note body ready (DOCX import, primarily) rather than
  // wanting the blank starter template createNote always builds.
  createNoteWithContent: (name: string, content: string) => Promise<string>
  createFolder: (name: string) => Promise<void>
  moveNote: (fileId: string, newParentId: string, oldParentId: string) => Promise<void>
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1
    if (a.type !== 'folder' && b.type === 'folder') return 1
    return a.name.localeCompare(b.name)
  })
}

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

    return sortNodes(nodes)
  }

  return build(rootId)
}

// Inserts a node directly into the in-memory tree, no re-fetch — used by
// createNote/createFolder so the sidebar doesn't have to go through
// loadVault's isLoading flash. That flash briefly unmounted the whole
// FileTree (Sidebar renders a spinner in its place while isLoading), which
// destroyed every FileTreeNode instance and reset each folder's local
// expanded/collapsed state back to closed — reported as "creating a note
// collapses all my folders."
function insertNode(nodes: FileTreeNode[], parentId: string, rootFolderId: string, newNode: FileTreeNode): FileTreeNode[] {
  if (parentId === rootFolderId) return sortNodes([...nodes, newNode])
  return nodes.map((node) => {
    if (node.type !== 'folder') return node
    if (node.id === parentId) return { ...node, children: sortNodes([...node.children, newNode]) }
    return { ...node, children: insertNode(node.children, parentId, rootFolderId, newNode) }
  })
}

function removeNode(nodes: FileTreeNode[], id: string): FileTreeNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => (node.type === 'folder' ? { ...node, children: removeNode(node.children, id) } : node))
}

function findNode(nodes: FileTreeNode[], id: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.type === 'folder') {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

// Shared by createNote/createNoteWithContent — inserts the new file into
// the in-memory tree (no re-fetch, see insertNode's own comment for why)
// and indexes its known-up-front content immediately, so a just-created
// note is searchable/backlink-scannable/tag-browsable right away rather
// than only after its first real save.
function registerNewNoteFile(
  get: () => VaultState,
  set: (partial: Partial<VaultState>) => void,
  file: DriveFile,
  content: string,
) {
  const { fileTree, rootFolderId } = get()
  if (!rootFolderId) return
  const newNode: FileTreeNode = { id: file.id, name: file.name, type: 'file', modifiedTime: file.modifiedTime }
  const nextTree = insertNode(fileTree, rootFolderId, rootFolderId, newNode)
  set({ fileTree: nextTree })
  useSearchStore.getState().updateIndexForNote(file.id, content)
  useBacklinksStore.getState().updateForNote(file.id, content, nextTree)
  useTagsStore.getState().updateForNote(file.id, content)
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
      // Fire-and-forget — indexing note bodies for search/backlinks/tags
      // shouldn't block the sidebar from rendering the tree it already has.
      useSearchStore.getState().buildIndex(fileTree)
      useBacklinksStore.getState().buildMap(fileTree)
      useTagsStore.getState().buildMap(fileTree)
    } catch (err) {
      const message = toUserMessage(err, 'Could not load your vault from Google Drive.')
      logError('vault.loadVault', err)
      useToastStore.getState().show(message, 'error')
      set({ isLoading: false, error: message })
    }
  },

  createNote: async (name) => {
    const filename = name.endsWith('.md') ? name : `${name}.md`
    const title = name.replace(/\.md$/, '')
    const today = new Date().toISOString().slice(0, 10)
    const content = `---\ntitle: ${title}\ncreated: ${today}\n---\n\n# ${title}\n`

    const file = await driveService.createNote(filename, content)
    registerNewNoteFile(get, set, file, content)
    return file.id
  },

  createNoteWithContent: async (name, content) => {
    const filename = name.endsWith('.md') ? name : `${name}.md`
    const file = await driveService.createNote(filename, content)
    registerNewNoteFile(get, set, file, content)
    return file.id
  },

  createFolder: async (name) => {
    const folder = await driveService.createFolder(name)
    const { fileTree, rootFolderId } = get()
    if (rootFolderId) {
      const newNode: FileTreeNode = { id: folder.id, name: folder.name, type: 'folder', children: [] }
      set({ fileTree: insertNode(fileTree, rootFolderId, rootFolderId, newNode) })
    }
  },

  moveNote: async (fileId, newParentId, oldParentId) => {
    await driveService.moveFile(fileId, newParentId, oldParentId)
    const { fileTree, rootFolderId } = get()
    const node = findNode(fileTree, fileId)
    if (node && rootFolderId) {
      const withoutNode = removeNode(fileTree, fileId)
      set({ fileTree: insertNode(withoutNode, newParentId, rootFolderId, node) })
    }
  },
}))
