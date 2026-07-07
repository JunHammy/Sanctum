import * as driveService from './drive.service'
import { extractFrontmatter } from './markdown.service'
import { flattenFiles } from './search.service'
import { getCachedContent, setCachedContent, getMeta, setMeta, deleteMeta } from './cache.service'
import { resolveWikilink } from '../lib/wikilink-resolver'
import { extractWikilinkTargets } from '../lib/wikilink-syntax'
import type { FileTreeNode } from '../types/vault.types'

export type BacklinkMap = Map<string, string[]> // targetId -> source note ids that link to it

// Namespaced by vault id — see search.service.ts's searchIndexMetaKey.
const backlinkMapMetaKey = (vaultId: string) => `backlink-map:${vaultId}`
// Same batch size as search.service's indexer, for the same reason —
// personal vault scale, but no reason to fire everything at once either.
const FETCH_BATCH_SIZE = 8

function addLink(working: Map<string, Set<string>>, targetId: string, sourceId: string) {
  const set = working.get(targetId) ?? new Set<string>()
  set.add(sourceId)
  working.set(targetId, set)
}

function removeSourceEverywhere(working: Map<string, Set<string>>, sourceId: string) {
  for (const set of working.values()) set.delete(sourceId)
}

function indexNoteLinks(working: Map<string, Set<string>>, sourceId: string, raw: string, fileTree: FileTreeNode[]) {
  const { content } = extractFrontmatter(raw)
  for (const target of extractWikilinkTargets(content)) {
    const targetId = resolveWikilink(target, fileTree)
    if (targetId && targetId !== sourceId) addLink(working, targetId, sourceId)
  }
}

function toBacklinkMap(working: Map<string, Set<string>>): BacklinkMap {
  const map: BacklinkMap = new Map()
  for (const [targetId, sources] of working) map.set(targetId, Array.from(sources))
  return map
}

async function persist(map: BacklinkMap, vaultId: string): Promise<void> {
  await setMeta(backlinkMapMetaKey(vaultId), Array.from(map.entries()))
}

export async function loadCachedMap(vaultId: string): Promise<BacklinkMap | null> {
  const entries = await getMeta<[string, string[]][]>(backlinkMapMetaKey(vaultId))
  return entries ? new Map(entries) : null
}

// Called when a vault is deleted, so its backlink map doesn't linger
// orphaned in IndexedDB forever.
export async function clearVaultCache(vaultId: string): Promise<void> {
  await deleteMeta(backlinkMapMetaKey(vaultId))
}

// Full rebuild of every note's outgoing links. Reuses whatever raw content
// search.service's indexer already cached (same cache.service store, keyed
// by fileId + Drive modifiedTime) — a note whose content hasn't changed
// since it was last cached costs nothing here, no second network fetch.
// A note not yet cached by anything still gets fetched (and cached) here,
// so backlinks work correctly even if search indexing hasn't run.
export async function buildBacklinkMap(fileTree: FileTreeNode[], vaultId: string): Promise<BacklinkMap> {
  const working = new Map<string, Set<string>>()
  const files = flattenFiles(fileTree)
  const toFetch: typeof files = []

  for (const file of files) {
    const cached = await getCachedContent(file.id)
    if (cached && file.modifiedTime && cached.modifiedTime === file.modifiedTime) {
      indexNoteLinks(working, file.id, cached.raw, fileTree)
    } else {
      toFetch.push(file)
    }
  }

  for (let i = 0; i < toFetch.length; i += FETCH_BATCH_SIZE) {
    const batch = toFetch.slice(i, i + FETCH_BATCH_SIZE)
    await Promise.all(
      batch.map(async (file) => {
        try {
          const raw = await driveService.readFile(file.id)
          if (file.modifiedTime) await setCachedContent(file.id, { raw, modifiedTime: file.modifiedTime })
          indexNoteLinks(working, file.id, raw, fileTree)
        } catch {
          // One note failing to fetch shouldn't abort the whole map build —
          // it just won't contribute any outgoing links until the next
          // successful rebuild.
        }
      }),
    )
  }

  const map = toBacklinkMap(working)
  await persist(map, vaultId)
  return map
}

// Incremental update for a single note (called on save) — drops its old
// outgoing links wholesale and re-scans the new content, rather than
// rebuilding the whole vault's map.
export async function updateBacklinksForNote(
  existing: BacklinkMap,
  fileId: string,
  raw: string,
  fileTree: FileTreeNode[],
  vaultId: string,
): Promise<BacklinkMap> {
  const working = new Map<string, Set<string>>()
  for (const [targetId, sources] of existing) working.set(targetId, new Set(sources))

  removeSourceEverywhere(working, fileId)
  indexNoteLinks(working, fileId, raw, fileTree)

  const map = toBacklinkMap(working)
  await persist(map, vaultId)
  return map
}
