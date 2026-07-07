import * as driveService from './drive.service'
import { extractFrontmatter } from './markdown.service'
import { flattenFiles } from './search.service'
import { getCachedContent, setCachedContent, getMeta, setMeta, deleteMeta } from './cache.service'
import { extractInlineTags } from '../lib/tag-syntax'
import type { FileTreeNode } from '../types/vault.types'

export type TagMap = Map<string, string[]> // tag -> note ids carrying it

// Namespaced by vault id — see search.service.ts's searchIndexMetaKey.
const tagMapMetaKey = (vaultId: string) => `tag-map:${vaultId}`
// Same batch size as search.service's/backlinks.service's indexers.
const FETCH_BATCH_SIZE = 8

function addTag(working: Map<string, Set<string>>, tag: string, fileId: string) {
  const set = working.get(tag) ?? new Set<string>()
  set.add(fileId)
  working.set(tag, set)
}

function removeSourceEverywhere(working: Map<string, Set<string>>, fileId: string) {
  for (const set of working.values()) set.delete(fileId)
}

// A tag can come from either frontmatter (`tags: [foo, bar]`, structured)
// or inline `#tag` in the body (Obsidian-style, rendered by plugin-tag.ts)
// — the tag browser treats both as the same first-class concept.
function indexNoteTags(working: Map<string, Set<string>>, fileId: string, raw: string) {
  const { content, data } = extractFrontmatter(raw)
  const frontmatterTags = Array.isArray(data.tags) ? data.tags.map(String) : []
  for (const tag of [...frontmatterTags, ...extractInlineTags(content)]) {
    const trimmed = tag.trim()
    if (trimmed) addTag(working, trimmed, fileId)
  }
}

function toTagMap(working: Map<string, Set<string>>): TagMap {
  const map: TagMap = new Map()
  for (const [tag, sources] of working) {
    // A tag whose last note just had it removed ends up with an empty Set
    // here (removeSourceEverywhere only calls .delete on each note's entry,
    // it doesn't drop the tag key itself) — buildTagMap never has this
    // problem since it only ever adds a key when a note actually uses it,
    // but updateTagsForNote clones from `existing` and can carry a
    // now-empty entry forward. Without this filter, a tag stayed visible
    // with a "0" count until the next full vault reload rebuilt the map
    // from scratch and naturally dropped it.
    if (sources.size > 0) map.set(tag, Array.from(sources))
  }
  return map
}

async function persist(map: TagMap, vaultId: string): Promise<void> {
  await setMeta(tagMapMetaKey(vaultId), Array.from(map.entries()))
}

export async function loadCachedMap(vaultId: string): Promise<TagMap | null> {
  const entries = await getMeta<[string, string[]][]>(tagMapMetaKey(vaultId))
  return entries ? new Map(entries) : null
}

// Called when a vault is deleted, so its tag map doesn't linger orphaned in
// IndexedDB forever.
export async function clearVaultCache(vaultId: string): Promise<void> {
  await deleteMeta(tagMapMetaKey(vaultId))
}

// Full rebuild — same cache-reuse strategy as backlinks.service.ts:
// content search indexing already cached costs nothing extra here.
export async function buildTagMap(fileTree: FileTreeNode[], vaultId: string): Promise<TagMap> {
  const working = new Map<string, Set<string>>()
  const files = flattenFiles(fileTree)
  const toFetch: typeof files = []

  for (const file of files) {
    const cached = await getCachedContent(file.id)
    if (cached && file.modifiedTime && cached.modifiedTime === file.modifiedTime) {
      indexNoteTags(working, file.id, cached.raw)
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
          indexNoteTags(working, file.id, raw)
        } catch {
          // One note failing to fetch shouldn't abort the whole map build.
        }
      }),
    )
  }

  const map = toTagMap(working)
  await persist(map, vaultId)
  return map
}

// Incremental update for a single note (called on save/create) — drops its
// old tags wholesale and re-scans the new content.
export async function updateTagsForNote(existing: TagMap, fileId: string, raw: string, vaultId: string): Promise<TagMap> {
  const working = new Map<string, Set<string>>()
  for (const [tag, sources] of existing) working.set(tag, new Set(sources))

  removeSourceEverywhere(working, fileId)
  indexNoteTags(working, fileId, raw)

  const map = toTagMap(working)
  await persist(map, vaultId)
  return map
}
