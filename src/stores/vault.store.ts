import { create } from 'zustand'
import * as driveService from '../services/drive.service'
import * as searchService from '../services/search.service'
import * as tagsService from '../services/tags.service'
import * as backlinksService from '../services/backlinks.service'
import { useSearchStore } from './search.store'
import { useBacklinksStore } from './backlinks.store'
import { useTagsStore } from './tags.store'
import { useTabsStore } from './tabs.store'
import { useNoteStore } from './note.store'
import { useToastStore } from './toast.store'
import { useVaultPreferenceStore } from './vault-preference.store'
import { toUserMessage, logError } from '../lib/error-messages'
import type { VaultMeta, DriveFile } from '../services/drive.service'
import type { FileTreeNode } from '../types/vault.types'

interface VaultState {
  vaults: VaultMeta[]
  activeVaultId: string | null
  // Alias of activeVaultId — kept under its original name since every
  // existing tree-mutating action (createNote, moveNode, etc.) already
  // reads the active root id from here, and there's no reason to touch
  // every one of those call sites just to rename a field.
  rootFolderId: string | null
  containerFolderId: string | null
  fileTree: FileTreeNode[]
  isLoading: boolean
  error: string | null
  loadVault: () => Promise<void>
  switchVault: (vaultId: string) => Promise<void>
  createVault: (name: string) => Promise<void>
  renameVault: (vaultId: string, name: string) => Promise<void>
  deleteVault: (vaultId: string) => Promise<void>
  createNote: (name: string) => Promise<string>
  // Same reactive-insert path as createNote, but for a caller that already
  // has a full note body ready (DOCX import, primarily) rather than
  // wanting the blank starter template createNote always builds.
  createNoteWithContent: (name: string, content: string) => Promise<string>
  createFolder: (name: string) => Promise<void>
  // Renamed from moveNote — it was already fully generic (findNode/
  // removeNode/insertNode operate on any FileTreeNode, not specifically
  // files), and is now genuinely used for both notes and folders (folder-
  // into-folder drag nesting), so the old name stopped being accurate.
  moveNode: (id: string, newParentId: string, oldParentId: string) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  // Called on sign-out — a different Google account has an entirely
  // different Drive, so a stale vaults list/activeVaultId from the
  // previous session must not survive into it.
  reset: () => void
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1
    if (a.type !== 'folder' && b.type === 'folder') return 1
    return a.name.localeCompare(b.name)
  })
}

function groupByParent(files: DriveFile[]): Map<string, DriveFile[]> {
  const childrenByParent = new Map<string, DriveFile[]>()
  for (const file of files) {
    const parentId = file.parents?.[0]
    if (!parentId) continue
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(file)
    childrenByParent.set(parentId, siblings)
  }
  return childrenByParent
}

function buildFileTree(files: DriveFile[], rootId: string): FileTreeNode[] {
  const childrenByParent = groupByParent(files)

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

export interface VaultStats {
  noteCount: number
  lastModified: string | null
}

// Walks the same Drive parents-tree buildFileTree does, but only tallies a
// note count + latest modifiedTime — used by the vault manager page to show
// a quick summary for every vault without switching into each one first.
export function computeVaultStats(files: DriveFile[], vaultId: string): VaultStats {
  const childrenByParent = groupByParent(files)
  let noteCount = 0
  let lastModified: string | null = null

  function walk(parentId: string) {
    const children = childrenByParent.get(parentId) ?? []
    for (const item of children) {
      if (item.mimeType === FOLDER_MIME) {
        if (item.name === '.vault') continue
        walk(item.id)
      } else if (item.name.endsWith('.md')) {
        noteCount++
        if (item.modifiedTime && (!lastModified || item.modifiedTime > lastModified)) lastModified = item.modifiedTime
      }
    }
  }

  walk(vaultId)
  return { noteCount, lastModified }
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

// Loads the currently active vault's file tree + search/tag/backlink
// indices. Split out from loadVault/switchVault since both need exactly
// this same sequence once activeVaultId is already settled.
async function loadActiveVaultTree(get: () => VaultState, set: (partial: Partial<VaultState>) => void) {
  const { activeVaultId: requestedVaultId } = get()
  if (!requestedVaultId) {
    set({ fileTree: [], isLoading: false })
    return
  }
  set({ isLoading: true, error: null })
  try {
    const files = await driveService.listAllFiles()
    // listAllFiles() is a slow whole-Drive fetch — the active vault can
    // change while it's in flight (rapid switching, or an overlapping
    // loadVault() call from navigating between /vault and /vaults). A
    // stale fileTree built for the OLD vault must never be applied, and
    // must never reach buildIndex/buildMap: those read the CURRENT active
    // vault id fresh, so pairing them with a stale fileTree here is
    // exactly how one vault's notes previously ended up permanently
    // persisted under a different vault's search/tag/backlink cache key
    // (upsert-only indexing never prunes documents that don't belong).
    if (get().activeVaultId !== requestedVaultId) return
    const fileTree = buildFileTree(files, requestedVaultId)
    set({ fileTree, isLoading: false })
    // Fire-and-forget — indexing note bodies for search/backlinks/tags
    // shouldn't block the sidebar from rendering the tree it already has.
    useSearchStore.getState().buildIndex(fileTree)
    useBacklinksStore.getState().buildMap(fileTree)
    useTagsStore.getState().buildMap(fileTree)
  } catch (err) {
    if (get().activeVaultId !== requestedVaultId) return
    const message = toUserMessage(err, 'Could not load your vault from Google Drive.')
    logError('vault.loadActiveVaultTree', err)
    useToastStore.getState().show(message, 'error')
    set({ isLoading: false, error: message })
  }
}

export const useVaultStore = create<VaultState>()((set, get) => ({
  vaults: [],
  activeVaultId: null,
  rootFolderId: null,
  containerFolderId: null,
  fileTree: [],
  isLoading: false,
  error: null,

  loadVault: async () => {
    set({ isLoading: true, error: null })
    try {
      const container = await driveService.findOrCreateContainerFolder()
      await driveService.migrateFlatVaultIfNeeded(container.id)
      const vaults = await driveService.listVaults(container.id)

      if (vaults.length === 0) {
        // Brand new account, nothing to migrate and no vault created yet —
        // VaultManagerRoute is where the user creates their first one.
        set({
          containerFolderId: container.id,
          vaults: [],
          activeVaultId: null,
          rootFolderId: null,
          fileTree: [],
          isLoading: false,
        })
        return
      }

      const preferred = useVaultPreferenceStore.getState().activeVaultId
      const activeVaultId = preferred && vaults.some((v) => v.id === preferred) ? preferred : vaults[0].id
      useVaultPreferenceStore.getState().setActiveVaultId(activeVaultId)
      set({ containerFolderId: container.id, vaults, activeVaultId, rootFolderId: activeVaultId })
      await loadActiveVaultTree(get, set)
    } catch (err) {
      const message = toUserMessage(err, 'Could not load your vault from Google Drive.')
      logError('vault.loadVault', err)
      useToastStore.getState().show(message, 'error')
      set({ isLoading: false, error: message })
    }
  },

  switchVault: async (vaultId) => {
    const { vaults } = get()
    if (!vaults.some((v) => v.id === vaultId)) return
    // Reset every other vault-scoped store BEFORE loading the new tree, so
    // there's no window where the sidebar/search/tags/backlinks still show
    // the previous vault's data against the new activeVaultId.
    useSearchStore.getState().reset()
    useTagsStore.getState().reset()
    useBacklinksStore.getState().reset()
    useTabsStore.getState().resetTabs()
    useNoteStore.getState().reset()
    useVaultPreferenceStore.getState().setActiveVaultId(vaultId)
    set({ activeVaultId: vaultId, rootFolderId: vaultId, fileTree: [] })
    await loadActiveVaultTree(get, set)
  },

  createVault: async (name) => {
    const { containerFolderId, vaults } = get()
    if (!containerFolderId) return
    const vault = await driveService.createVaultFolder(containerFolderId, name)
    set({ vaults: [...vaults, vault] })
    await get().switchVault(vault.id)
  },

  renameVault: async (vaultId, name) => {
    const updated = await driveService.renameVaultFolder(vaultId, name)
    set((s) => ({ vaults: s.vaults.map((v) => (v.id === vaultId ? updated : v)) }))
  },

  deleteVault: async (vaultId) => {
    const { vaults, activeVaultId } = get()
    await driveService.trashFile(vaultId)
    // Drop the deleted vault's namespaced search/tag/backlink cache entries
    // so they don't linger orphaned in IndexedDB forever.
    await Promise.all([
      searchService.clearVaultCache(vaultId),
      tagsService.clearVaultCache(vaultId),
      backlinksService.clearVaultCache(vaultId),
    ])
    const remaining = vaults.filter((v) => v.id !== vaultId)
    set({ vaults: remaining })
    if (activeVaultId !== vaultId) return
    if (remaining.length > 0) {
      await get().switchVault(remaining[0].id)
    } else {
      useSearchStore.getState().reset()
      useTagsStore.getState().reset()
      useBacklinksStore.getState().reset()
      useTabsStore.getState().resetTabs()
      useNoteStore.getState().reset()
      useVaultPreferenceStore.getState().setActiveVaultId(null)
      set({ activeVaultId: null, rootFolderId: null, fileTree: [] })
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

  moveNode: async (id, newParentId, oldParentId) => {
    await driveService.moveFile(id, newParentId, oldParentId)
    const { fileTree, rootFolderId } = get()
    const node = findNode(fileTree, id)
    if (node && rootFolderId) {
      const withoutNode = removeNode(fileTree, id)
      set({ fileTree: insertNode(withoutNode, newParentId, rootFolderId, node) })
    }
  },

  // Trashes via Drive (recoverable from Drive's own Trash, not a permanent
  // delete — see trashFile's own comment), then removes it from the local
  // tree. removeNode already recurses into children, so deleting a folder
  // drops its whole subtree from the sidebar in one call — matching what
  // actually happens on Drive's side too (trashing a folder cascades to
  // everything inside it there as well, no separate per-child API calls
  // needed).
  deleteNode: async (id) => {
    await driveService.trashFile(id)
    const { fileTree } = get()
    set({ fileTree: removeNode(fileTree, id) })
  },

  reset: () => {
    set({
      vaults: [],
      activeVaultId: null,
      rootFolderId: null,
      containerFolderId: null,
      fileTree: [],
      isLoading: false,
      error: null,
    })
  },
}))
