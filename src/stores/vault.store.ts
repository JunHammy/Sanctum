import { create } from 'zustand'
import * as driveService from '../services/drive.service'
import * as searchService from '../services/search.service'
import * as tagsService from '../services/tags.service'
import * as backlinksService from '../services/backlinks.service'
import * as cacheService from '../services/cache.service'
import { useSearchStore } from './search.store'
import { useBacklinksStore } from './backlinks.store'
import { useTagsStore } from './tags.store'
import { useTabsStore } from './tabs.store'
import { useNoteStore } from './note.store'
import { useToastStore } from './toast.store'
import { useVaultPreferenceStore } from './vault-preference.store'
import { toUserMessage, logError, isOfflineError } from '../lib/error-messages'
import { fixLinksAfterRename } from '../lib/rename-links'
import { isDescendantOf } from '../lib/vault-tree'
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
  // True whenever the currently-displayed vaults/fileTree came from
  // cache.service.ts rather than a fresh network response — reset to false
  // on every successful network load. Deliberately a separate flag from
  // `error` rather than overloading it: Sidebar's render guard is
  // `!isLoading && !error`, so a successful cache fallback must leave
  // `error` null or the whole tree would render as if still loading/broken.
  isOfflineFallback: boolean
  loadVault: () => Promise<void>
  switchVault: (vaultId: string) => Promise<void>
  createVault: (name: string) => Promise<void>
  renameVault: (vaultId: string, name: string) => Promise<void>
  deleteVault: (vaultId: string) => Promise<void>
  // parentId defaults to the vault root when omitted — passed explicitly
  // by the "New note"/"New folder" destination-folder picker (PromptModal)
  // when the user chose somewhere other than root.
  createNote: (name: string, parentId?: string) => Promise<string>
  // Same reactive-insert path as createNote, but for a caller that already
  // has a full note body ready (DOCX import, primarily) rather than
  // wanting the blank starter template createNote always builds.
  createNoteWithContent: (name: string, content: string, parentId?: string) => Promise<string>
  createFolder: (name: string, parentId?: string) => Promise<void>
  // Uploads a PDF as a real Drive attachment (no conversion, unlike
  // createNoteWithContent's docx/csv/xlsx callers) — inserted straight into
  // the tree the same reactive way, so it shows up in the sidebar (as a
  // clickable PDF row, see FileTreeNode.tsx) immediately.
  uploadPdf: (file: File) => Promise<string>
  // Renamed from moveNote — it was already fully generic (findNode/
  // removeNode/insertNode operate on any FileTreeNode, not specifically
  // files), and is now genuinely used for both notes and folders (folder-
  // into-folder drag nesting), so the old name stopped being accurate.
  moveNode: (id: string, newParentId: string, oldParentId: string) => Promise<void>
  // Renames on Drive, updates the tree in place, and — for notes only —
  // rewrites every [[OldName]] wikilink elsewhere in the vault to point at
  // the new name (see rename-links.ts). Folders aren't linkable, so no
  // link scan runs for them.
  renameNode: (id: string, newName: string) => Promise<void>
  // Manual drag-reorder within the same parent — folders and files
  // interleave freely in one ordered group (see sortGroup), so a folder can
  // be reordered relative to a sibling file and vice versa. Cross-folder
  // moves remain moveNode's job, not this one.
  reorderNode: (draggedId: string, targetId: string, side: 'before' | 'after') => Promise<void>
  // Flips a note/PDF's starred flag (Drive `properties.starred`) — a
  // discrete click, not a continuous gesture like reorderNode, so no
  // debounce: every toggle goes straight to Drive.
  toggleStarred: (id: string) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  // Called on sign-out — a different Google account has an entirely
  // different Drive, so a stale vaults list/activeVaultId from the
  // previous session must not survive into it.
  reset: () => void
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

// Within one sibling group (folders and files mixed together): explicitly
// ordered siblings (dragged at least once, see reorderNode) sort by their
// fractional order value first, ascending; everything else falls back to
// alphabetical and is appended after — so a brand-new sibling doesn't need
// an eager order backfill, it just sorts alphabetically among the unordered
// group until it's dragged.
function sortGroup(nodes: FileTreeNode[]): FileTreeNode[] {
  const ordered = nodes.filter((n) => n.order !== undefined).sort((a, b) => a.order! - b.order!)
  const unordered = nodes.filter((n) => n.order === undefined).sort((a, b) => a.name.localeCompare(b.name))
  return [...ordered, ...unordered]
}

// Folders and files interleave freely in one group, ordered by drag
// position (or alphabetically, for anything never explicitly dragged) —
// no folders-always-first split. That split was the earlier convention,
// dropped at the user's request (a folder or file's position should be
// whatever was actually dragged, not constrained by its type).
function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return sortGroup(nodes)
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
      const order = item.properties?.order !== undefined ? Number(item.properties.order) : undefined
      const starred = item.properties?.starred === 'true'
      if (item.mimeType === FOLDER_MIME) {
        if (item.name === '.vault') continue // hidden config folder, MP §7
        nodes.push({ id: item.id, name: item.name, type: 'folder', children: build(item.id), order })
      } else if (item.name.endsWith('.md')) {
        nodes.push({ id: item.id, name: item.name, type: 'file', modifiedTime: item.modifiedTime, order, starred })
      } else {
        nodes.push({ id: item.id, name: item.name, type: 'attachment', mimeType: item.mimeType, order, starred })
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

export interface StarredFile {
  id: string
  name: string
  mimeType: string
  vaultId: string
  vaultName: string
}

// Same "walk down from each known vault root" shape as computeVaultStats —
// no separate "walk up from a leaf to find its vault" traversal needed,
// since every vault's own root id is already known up front. Used by the
// Vaults page to show a cross-vault Starred section without switching into
// each vault first.
export function computeStarredFiles(files: DriveFile[], vaults: VaultMeta[]): StarredFile[] {
  const childrenByParent = groupByParent(files)
  const results: StarredFile[] = []

  function walk(parentId: string, vaultId: string, vaultName: string) {
    for (const item of childrenByParent.get(parentId) ?? []) {
      if (item.mimeType === FOLDER_MIME) {
        if (item.name !== '.vault') walk(item.id, vaultId, vaultName)
      } else if (item.properties?.starred === 'true') {
        results.push({ id: item.id, name: item.name, mimeType: item.mimeType, vaultId, vaultName })
      }
    }
  }

  for (const vault of vaults) walk(vault.id, vault.id, vault.name)
  return results
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

// Immutably replaces a node in place via updater, re-sorting just the
// sibling array it lives in (a rename can change alphabetical position).
function replaceNode(nodes: FileTreeNode[], id: string, updater: (node: FileTreeNode) => FileTreeNode): FileTreeNode[] {
  if (nodes.some((n) => n.id === id)) {
    return sortNodes(nodes.map((n) => (n.id === id ? updater(n) : n)))
  }
  return nodes.map((node) => (node.type === 'folder' ? { ...node, children: replaceNode(node.children, id, updater) } : node))
}

// Returns the sibling array (root list, or some folder's children) that
// directly contains the node with this id — used by reorderNode to compute
// the drop position among them, whether or not the dragged node currently
// lives in that same array (see findParentId below for the cross-parent case).
function findSiblings(nodes: FileTreeNode[], id: string): FileTreeNode[] | null {
  if (nodes.some((n) => n.id === id)) return nodes
  for (const node of nodes) {
    if (node.type === 'folder') {
      const found = findSiblings(node.children, id)
      if (found) return found
    }
  }
  return null
}

// The id of the folder (or rootFolderId) that directly contains the node
// with this id — used by reorderNode to detect a cross-parent drop (an
// item dragged out of one folder and dropped among a different level's
// siblings should move there, not just silently reject like a same-parent-
// only reorder would).
function findParentId(nodes: FileTreeNode[], id: string, currentParentId: string): string | null {
  if (nodes.some((n) => n.id === id)) return currentParentId
  for (const node of nodes) {
    if (node.type === 'folder') {
      const found = findParentId(node.children, id, node.id)
      if (found) return found
    }
  }
  return null
}

// Debounces the actual Drive write for reorderNode, keyed per dragged item
// — the optimistic tree update below still happens synchronously on every
// drop, but rapid repeated re-drags of the *same* item (a fast back-and-
// forth drag) would otherwise fire one PATCH per intermediate drop,
// piling up concurrent requests and risking Drive's per-user rate limit.
// Confirmed real bug: reordering repeatedly in quick succession made the
// sidebar visibly lag and eventually stop responding — each drop's
// network call was outliving the next drop, and the growing backlog of
// in-flight requests (plus their eventual rate-limit failures re-setting
// state) is what that lag was. Only the position as of the last drop
// within this window actually needs to reach Drive.
const REORDER_PERSIST_DELAY_MS = 500
const pendingReorderWrites = new Map<string, ReturnType<typeof setTimeout>>()

// Assigns every node in an already-sorted group a numeric position, real
// `order` values kept as-is and unordered nodes (alphabetical tail)
// synthesized as increasing values past the last real one — gives
// reorderNode a consistent numeric anchor to compute a fractional midpoint
// against even when neither neighbor has ever been explicitly ordered yet.
const REORDER_GAP = 1000
function effectiveOrders(sortedGroup: FileTreeNode[]): number[] {
  let last = 0
  return sortedGroup.map((node) => {
    if (node.order !== undefined) {
      last = node.order
      return node.order
    }
    last += REORDER_GAP
    return last
  })
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
  parentId?: string,
) {
  const { fileTree, rootFolderId } = get()
  if (!rootFolderId) return
  const newNode: FileTreeNode = { id: file.id, name: file.name, type: 'file', modifiedTime: file.modifiedTime }
  const nextTree = insertNode(fileTree, parentId ?? rootFolderId, rootFolderId, newNode)
  set({ fileTree: nextTree })
  useSearchStore.getState().updateIndexForNote(file.id, content)
  useBacklinksStore.getState().updateForNote(file.id, content, nextTree)
  useTagsStore.getState().updateForNote(file.id, content)
}

// Diffs the tree this device last knew about (from cache.service's
// IndexedDB, which survives a page refresh — unlike in-memory state) against
// the just-fetched tree, to catch notes renamed directly in Google Drive
// rather than through Sanctum's own rename button. Only notes are checked
// (flattenFiles only returns type: 'file' nodes) — folders aren't linkable,
// so a folder renamed externally needs no link fix-up, just the tree
// refresh loadActiveVaultTree already does unconditionally.
async function detectAndFixExternalRenames(previousTree: FileTreeNode[], freshTree: FileTreeNode[]) {
  const previousFiles = searchService.flattenFiles(previousTree)
  const freshById = new Map(searchService.flattenFiles(freshTree).map((f) => [f.id, f]))
  const renames = previousFiles
    .map((prev) => ({ prev, fresh: freshById.get(prev.id) }))
    .filter((r) => r.fresh && r.fresh.name !== r.prev.name) as { prev: { id: string; name: string }; fresh: { id: string; name: string } }[]

  if (renames.length === 0) return

  let totalLinks = 0
  let totalNotes = 0
  for (const { prev, fresh } of renames) {
    try {
      // Resolved against previousTree (the old id-to-name mapping) for
      // every rename in this batch, consistently — even if two renamed
      // notes link to each other, each fix-up needs the *old* names to
      // find what used to resolve where.
      const newNameNoExt = fresh.name.replace(/\.md$/, '')
      const { updatedNoteCount, linksUpdated } = await fixLinksAfterRename(prev.id, newNameNoExt, previousTree, freshTree)
      totalLinks += linksUpdated
      totalNotes += updatedNoteCount
    } catch (err) {
      logError('vault.detectExternalRename', err)
    }
  }

  if (totalLinks > 0) {
    useToastStore
      .getState()
      .show(
        `Detected ${renames.length} rename${renames.length === 1 ? '' : 's'} made in Google Drive — updated ${totalLinks} link${totalLinks === 1 ? '' : 's'} in ${totalNotes} note${totalNotes === 1 ? '' : 's'}`,
        'info',
      )
  }
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
    set({ fileTree, isLoading: false, isOfflineFallback: false })
    // Read before the write-through below overwrites it — this is the tree
    // as of this device's last successful load, the baseline
    // detectAndFixExternalRenames needs to notice a Drive-side rename.
    const previousTree = await cacheService.getCachedFileTree(requestedVaultId)
    // Fire-and-forget write-through — lets the sidebar render offline the
    // next time this vault can't be reached, same convention as the
    // buildIndex/buildMap calls just below it not blocking on completion.
    cacheService.setCachedFileTree(requestedVaultId, fileTree)
    // Fire-and-forget — indexing note bodies for search/backlinks/tags
    // shouldn't block the sidebar from rendering the tree it already has.
    useSearchStore.getState().buildIndex(fileTree)
    useBacklinksStore.getState().buildMap(fileTree)
    useTagsStore.getState().buildMap(fileTree)
    // Fire-and-forget — a note renamed directly in Google Drive (outside
    // Sanctum) needs its links elsewhere in the vault fixed up too, same as
    // an in-app rename does via renameNode.
    if (previousTree) detectAndFixExternalRenames(previousTree, fileTree)
  } catch (err) {
    if (get().activeVaultId !== requestedVaultId) return
    if (isOfflineError(err)) {
      const cachedTree = await cacheService.getCachedFileTree(requestedVaultId)
      if (get().activeVaultId !== requestedVaultId) return // re-check after the await
      if (cachedTree) {
        set({ fileTree: cachedTree, isLoading: false, isOfflineFallback: true, error: null })
        // Still index the cached tree — these calls already tolerate
        // reading through cache.service.ts's own content store per-note
        // (see search.service.ts), so search/tags/backlinks stay usable
        // offline too, not just the tree itself.
        useSearchStore.getState().buildIndex(cachedTree)
        useBacklinksStore.getState().buildMap(cachedTree)
        useTagsStore.getState().buildMap(cachedTree)
        return
      }
      const message = "This vault hasn't been opened on this device before, so it isn't available offline — connect to load it."
      set({ isLoading: false, error: message, isOfflineFallback: false })
      return
    }
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
  isOfflineFallback: false,

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
          isOfflineFallback: false,
        })
        return
      }

      const preferred = useVaultPreferenceStore.getState().activeVaultId
      const activeVaultId = preferred && vaults.some((v) => v.id === preferred) ? preferred : vaults[0].id
      useVaultPreferenceStore.getState().setActiveVaultId(activeVaultId)
      set({ containerFolderId: container.id, vaults, activeVaultId, rootFolderId: activeVaultId, isOfflineFallback: false })
      cacheService.setCachedVaults(container.id, vaults) // fire-and-forget write-through
      await loadActiveVaultTree(get, set)
    } catch (err) {
      if (isOfflineError(err)) {
        const cached = await cacheService.getCachedVaults()
        if (cached) {
          const preferred = useVaultPreferenceStore.getState().activeVaultId
          const activeVaultId =
            preferred && cached.vaults.some((v) => v.id === preferred) ? preferred : (cached.vaults[0]?.id ?? null)
          set({
            containerFolderId: cached.containerFolderId,
            vaults: cached.vaults,
            activeVaultId,
            rootFolderId: activeVaultId,
            isLoading: false,
            isOfflineFallback: true,
            error: null,
          })
          if (activeVaultId) await loadActiveVaultTree(get, set)
          else set({ isLoading: false })
          return
        }
        set({
          isLoading: false,
          isOfflineFallback: false,
          error: "You're offline and haven't opened any vault on this device yet — connect to load your vaults.",
        })
        return
      }
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
      cacheService.clearCachedFileTree(vaultId),
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

  createNote: async (name, parentId) => {
    const filename = name.endsWith('.md') ? name : `${name}.md`
    const title = name.replace(/\.md$/, '')
    const today = new Date().toISOString().slice(0, 10)
    const content = `---\ntitle: ${title}\ncreated: ${today}\n---\n\n# ${title}\n`

    const file = await driveService.createNote(filename, content, parentId)
    registerNewNoteFile(get, set, file, content, parentId)
    return file.id
  },

  createNoteWithContent: async (name, content, parentId) => {
    const filename = name.endsWith('.md') ? name : `${name}.md`
    const file = await driveService.createNote(filename, content, parentId)
    registerNewNoteFile(get, set, file, content, parentId)
    return file.id
  },

  createFolder: async (name, parentId) => {
    const folder = await driveService.createFolder(name, parentId)
    const { fileTree, rootFolderId } = get()
    if (rootFolderId) {
      const newNode: FileTreeNode = { id: folder.id, name: folder.name, type: 'folder', children: [] }
      set({ fileTree: insertNode(fileTree, parentId ?? rootFolderId, rootFolderId, newNode) })
    }
  },

  uploadPdf: async (file) => {
    const { fileTree, rootFolderId } = get()
    if (!rootFolderId) throw new Error('Vault not loaded yet')
    const uploaded = await driveService.uploadAttachment(rootFolderId, file.name, file)
    const newNode: FileTreeNode = { id: uploaded.id, name: uploaded.name, type: 'attachment', mimeType: uploaded.mimeType }
    set({ fileTree: insertNode(fileTree, rootFolderId, rootFolderId, newNode) })
    return uploaded.id
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

  renameNode: async (id, newName) => {
    const { fileTree, rootFolderId } = get()
    const node = findNode(fileTree, id)
    if (!node || !rootFolderId) return

    const oldTree = fileTree
    const isNote = node.type === 'file'
    const driveFilename = isNote ? (newName.endsWith('.md') ? newName : `${newName}.md`) : newName
    const displayName = driveFilename.replace(/\.md$/, '')

    await driveService.renameFile(id, driveFilename)

    const nextTree = replaceNode(fileTree, id, (n) => ({ ...n, name: driveFilename }))
    set({ fileTree: nextTree })
    cacheService.setCachedFileTree(rootFolderId, nextTree) // fire-and-forget write-through

    if (!isNote) {
      useToastStore.getState().show(`Renamed to "${displayName}"`, 'success')
      return
    }

    // Re-index the renamed note itself — content is unchanged, but search's
    // title falls back to the filename when there's no frontmatter title,
    // so it needs a refresh even though the raw body didn't change.
    try {
      const cached = await cacheService.getCachedContent(id)
      const raw =
        cached && node.type === 'file' && node.modifiedTime && cached.modifiedTime === node.modifiedTime
          ? cached.raw
          : await driveService.readFile(id)
      await useSearchStore.getState().updateIndexForNote(id, raw)
      await useBacklinksStore.getState().updateForNote(id, raw, nextTree)
      await useTagsStore.getState().updateForNote(id, raw)
    } catch {
      // Best-effort re-index — the rename itself already succeeded.
    }

    const { updatedNoteCount, linksUpdated } = await fixLinksAfterRename(id, displayName, oldTree, nextTree)
    const message =
      updatedNoteCount > 0
        ? `Renamed to "${displayName}" — updated ${linksUpdated} link${linksUpdated === 1 ? '' : 's'} in ${updatedNoteCount} note${updatedNoteCount === 1 ? '' : 's'}`
        : `Renamed to "${displayName}"`
    useToastStore.getState().show(message, 'success')
  },

  // Dropping before/after a sibling reorders in place; dropping before/
  // after an item that lives under a *different* parent moves the dragged
  // item there too, landing at that exact position — same one-gesture
  // "drag it out among the items you can see" convention VS Code's own
  // explorer uses, rather than requiring a separate dedicated drop target
  // just to change an item's parent.
  reorderNode: async (draggedId, targetId, side) => {
    if (draggedId === targetId) return
    const { fileTree, rootFolderId } = get()
    if (!rootFolderId) return
    const draggedNode = findNode(fileTree, draggedId)
    const targetNode = findNode(fileTree, targetId)
    if (!draggedNode || !targetNode) return
    // A folder can't be dropped next to one of its own descendants — same
    // corruption risk moveNode's own "into" path already guards against.
    if (draggedNode.type === 'folder' && isDescendantOf(fileTree, draggedId, targetId)) return

    const siblings = findSiblings(fileTree, targetId)
    if (!siblings) return
    const targetParentId = findParentId(fileTree, targetId, rootFolderId) ?? rootFolderId
    const draggedParentId = findParentId(fileTree, draggedId, rootFolderId) ?? rootFolderId
    const isCrossParent = draggedParentId !== targetParentId

    // Folders and files interleave freely now — the sibling group used to
    // compute a fractional order is every sibling regardless of type, not
    // split into a same-type-only group.
    const group = siblings.filter((n) => n.id !== draggedId)
    const sortedGroup = sortGroup(group)
    const positions = effectiveOrders(sortedGroup)
    const targetIdx = sortedGroup.findIndex((n) => n.id === targetId)
    if (targetIdx === -1) return

    const newOrder =
      side === 'before'
        ? (positions[targetIdx] + (targetIdx > 0 ? positions[targetIdx - 1] : positions[targetIdx] - REORDER_GAP * 2)) / 2
        : (positions[targetIdx] +
            (targetIdx < positions.length - 1 ? positions[targetIdx + 1] : positions[targetIdx] + REORDER_GAP * 2)) /
          2

    // Confirmed real bug via testing ("drops land somewhere else than where
    // I dropped it"): sortGroup renders every explicitly-ordered sibling
    // BEFORE every never-dragged one, regardless of numeric value — it's
    // two rigid buckets, not one continuous line. `positions` above treats
    // the whole group as if it WERE one continuous line (real orders and
    // synthesized alphabetical-fallback positions mixed together) purely to
    // compute newOrder's midpoint — but until now, only the dragged item
    // ever actually received a real `order`, so it could get promoted into
    // the "ordered" bucket and render before/after a still-unordered
    // neighbor in a way that contradicts the very position it was just
    // computed against. Backfilling a real order onto every other
    // currently-unordered sibling in the same pass is what actually
    // collapses this back down to one consistent, comparable ordering for
    // the whole group, permanently (not just until the next never-ordered
    // item is added, which still correctly starts out alphabetical-tail
    // until it's dragged itself).
    const backfills = new Map<string, number>()
    sortedGroup.forEach((n, i) => {
      if (n.order === undefined) backfills.set(n.id, positions[i])
    })

    // Optimistic: a drag is a fluid, continuous gesture, so the tree
    // updates immediately — awaiting the Drive write first (as every other
    // mutation here does) made a drop visibly lag behind the cursor.
    // Reverted below if the write fails.
    const previousTree = fileTree
    let nextTree = fileTree
    for (const [id, order] of backfills) {
      nextTree = replaceNode(nextTree, id, (n) => ({ ...n, order }))
    }
    nextTree = isCrossParent
      ? insertNode(removeNode(nextTree, draggedId), targetParentId, rootFolderId, { ...draggedNode, order: newOrder })
      : replaceNode(nextTree, draggedId, (n) => ({ ...n, order: newOrder }))
    set({ fileTree: nextTree })
    cacheService.setCachedFileTree(rootFolderId, nextTree) // fire-and-forget write-through

    // Debounced Drive write — see pendingReorderWrites' own comment. A
    // repeated re-drag of this same item before the delay elapses cancels
    // the previous pending write and reschedules, so only the position as
    // of the last drop in a burst actually reaches Drive. Backfilled
    // siblings aren't part of that debounce (they're a one-time correction
    // for this drop, not something that keeps changing mid-drag) — written
    // alongside, once.
    const existingTimer = pendingReorderWrites.get(draggedId)
    if (existingTimer) clearTimeout(existingTimer)
    pendingReorderWrites.set(
      draggedId,
      setTimeout(() => {
        pendingReorderWrites.delete(draggedId)
        void (async () => {
          try {
            if (isCrossParent) await driveService.moveFile(draggedId, targetParentId, draggedParentId)
            await Promise.all([
              driveService.setFileOrder(draggedId, newOrder),
              ...Array.from(backfills, ([id, order]) => driveService.setFileOrder(id, order)),
            ])
          } catch (err) {
            if (get().fileTree === nextTree) {
              set({ fileTree: previousTree })
              cacheService.setCachedFileTree(rootFolderId, previousTree)
            }
            logError('vault.reorderNode', err)
            useToastStore.getState().show(toUserMessage(err, 'Could not move that item.'), 'error')
          }
        })()
      }, REORDER_PERSIST_DELAY_MS),
    )
  },

  toggleStarred: async (id) => {
    const { fileTree, rootFolderId } = get()
    const node = findNode(fileTree, id)
    if (!node || node.type === 'folder' || !rootFolderId) return
    const nextStarred = !node.starred

    // Optimistic, same as reorderNode — but no debounce, since starring is
    // one discrete click, not a continuous gesture that can rapid-fire
    // several requests in a row.
    const previousTree = fileTree
    const nextTree = replaceNode(fileTree, id, (n) => ({ ...n, starred: nextStarred }))
    set({ fileTree: nextTree })
    cacheService.setCachedFileTree(rootFolderId, nextTree) // fire-and-forget write-through

    try {
      await driveService.setFileStarred(id, nextStarred)
    } catch (err) {
      if (get().fileTree === nextTree) {
        set({ fileTree: previousTree })
        cacheService.setCachedFileTree(rootFolderId, previousTree)
      }
      logError('vault.toggleStarred', err)
      useToastStore.getState().show(toUserMessage(err, 'Could not update starred status.'), 'error')
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
      isOfflineFallback: false,
    })
  },
}))
