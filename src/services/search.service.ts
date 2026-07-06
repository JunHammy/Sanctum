import MiniSearch from 'minisearch'
import * as driveService from './drive.service'
import { extractFrontmatter, slugify } from './markdown.service'
import { getCachedContent, setCachedContent, getMeta, setMeta } from './cache.service'
import { extractInlineTags } from '../lib/tag-syntax'
import { resolveWikilink } from '../lib/wikilink-resolver'
import { parseEmbedLine, extractSection } from '../lib/transclusion'
import type { FileTreeNode } from '../types/vault.types'

export interface SearchDoc {
  id: string
  title: string
  content: string
  tags: string
  excerpt: string
}

const SEARCH_INDEX_META_KEY = 'search-index'
// Fetched in small concurrent batches rather than all-at-once — personal
// vault scale, but no reason to fire 100+ simultaneous requests either.
const FETCH_BATCH_SIZE = 8
const EXCERPT_LENGTH = 160

const MINISEARCH_OPTIONS = {
  fields: ['title', 'content', 'tags'],
  // `content` itself isn't stored (only tokenized/searched) — keeps the
  // persisted index leaner. `excerpt` is a short prefix of the body, stored
  // so results can show *something* identifying, without needing a second
  // async lookup at query time for a real match-context snippet (a
  // reasonable v1 tradeoff, not a hard requirement).
  storeFields: ['title', 'tags', 'excerpt'],
  searchOptions: {
    boost: { title: 3, tags: 2 },
    fuzzy: 0.2,
    prefix: true,
  },
}

function createIndex(): MiniSearch<SearchDoc> {
  return new MiniSearch<SearchDoc>(MINISEARCH_OPTIONS)
}

export function flattenFiles(nodes: FileTreeNode[]): { id: string; name: string; modifiedTime?: string }[] {
  const files: { id: string; name: string; modifiedTime?: string }[] = []
  for (const node of nodes) {
    if (node.type === 'file') files.push({ id: node.id, name: node.name, modifiedTime: node.modifiedTime })
    else if (node.type === 'folder') files.push(...flattenFiles(node.children))
  }
  return files
}

export function toDoc(id: string, name: string, raw: string): SearchDoc {
  const { content, data } = extractFrontmatter(raw)
  const title = typeof data.title === 'string' && data.title.trim() ? data.title : name.replace(/\.md$/, '')
  const tags = Array.isArray(data.tags) ? data.tags.join(' ') : ''
  const excerpt = content.trim().slice(0, EXCERPT_LENGTH)
  return { id, title, content, tags, excerpt }
}

// Caps how deep a chain of embeds-within-embeds gets expanded for search —
// guards against pathological nesting, on top of the visited-set cycle
// guard below (which alone would already stop a genuine A-embeds-B-embeds-A
// loop, but not an accidentally very long linear chain).
const MAX_EMBED_DEPTH = 4

// Same cache-or-fetch as buildIndex's own loop below, just generalized so
// expandEmbeds can pull in a note *other* than the one currently being
// indexed — reuses the same cache.service store, so a note that's already
// being indexed in this same run (or was on a previous run) doesn't cost a
// second network fetch just because something else embeds it too.
async function resolveContentForIndex(fileId: string, fileTree: FileTreeNode[]): Promise<string | null> {
  const file = flattenFiles(fileTree).find((f) => f.id === fileId)
  if (!file) return null
  const cached = await getCachedContent(fileId)
  if (cached && file.modifiedTime && cached.modifiedTime === file.modifiedTime) return cached.raw
  try {
    const raw = await driveService.readFile(fileId)
    if (file.modifiedTime) await setCachedContent(fileId, { raw, modifiedTime: file.modifiedTime })
    return raw
  } catch {
    return null
  }
}

// Makes an embedded note's own words show up when searching the note that
// embeds it — otherwise a `![[Source]]` line only contributes the target's
// *name* to the index, not the actual content someone would search for.
// `visited` (seeded with the indexing note's own id, see toDocWithEmbeds)
// is what stops a genuine A-embeds-B-embeds-A cycle from recursing forever;
// MAX_EMBED_DEPTH is a second, coarser backstop against a long linear chain.
async function expandEmbeds(
  content: string,
  fileTree: FileTreeNode[],
  visited: Set<string>,
  depth: number,
): Promise<string> {
  if (depth >= MAX_EMBED_DEPTH) return content
  const lines = content.split('\n')
  const expanded = await Promise.all(
    lines.map(async (line) => {
      const parsed = parseEmbedLine(line)
      if (!parsed) return line
      const fileId = resolveWikilink(parsed.target, fileTree)
      if (!fileId || visited.has(fileId)) return line
      const raw = await resolveContentForIndex(fileId, fileTree)
      if (raw === null) return line
      const { content: targetContent } = extractFrontmatter(raw)
      const section =
        parsed.heading || parsed.blockId
          ? extractSection(targetContent, parsed.heading, parsed.blockId, parsed.headingEnd)
          : targetContent
      if (section === null) return line
      return expandEmbeds(section, fileTree, new Set(visited).add(fileId), depth + 1)
    }),
  )
  return expanded.join('\n')
}

// Async counterpart to toDoc, used everywhere a fileTree is available (i.e.
// everywhere except nowhere — kept toDoc itself separate/sync since it has
// no need for one). Title/tags/excerpt stay based on the note's *own* text
// (excerpt in particular — a search result's preview snippet should reflect
// what's actually in that note, not a paragraph pulled in from elsewhere);
// only `content` (what's actually tokenized/matched against) gets embeds
// expanded into it.
export async function toDocWithEmbeds(
  id: string,
  name: string,
  raw: string,
  fileTree: FileTreeNode[],
): Promise<SearchDoc> {
  const doc = toDoc(id, name, raw)
  doc.content = await expandEmbeds(doc.content, fileTree, new Set([id]), 0)
  return doc
}

function upsertDoc(index: MiniSearch<SearchDoc>, doc: SearchDoc) {
  if (index.has(doc.id)) index.discard(doc.id)
  index.add(doc)
}

async function persist(index: MiniSearch<SearchDoc>) {
  await setMeta(SEARCH_INDEX_META_KEY, JSON.stringify(index.toJSON()))
}

export async function loadCachedIndex(): Promise<MiniSearch<SearchDoc> | null> {
  const serialized = await getMeta<string>(SEARCH_INDEX_META_KEY)
  if (!serialized) return null
  try {
    return MiniSearch.loadJSON<SearchDoc>(serialized, MINISEARCH_OPTIONS)
  } catch {
    return null // corrupt/incompatible cache — buildIndex will rebuild from scratch
  }
}

// Note deletion isn't a feature Sanctum has yet (no delete-to-trash), so
// there's currently no way for a note to disappear from the vault except
// directly in Drive — stale-entry cleanup for that edge case is a known,
// deliberately deferred gap rather than something actively needed today.
export async function buildIndex(
  fileTree: FileTreeNode[],
  existing: MiniSearch<SearchDoc> | null,
): Promise<MiniSearch<SearchDoc>> {
  const index = existing ?? createIndex()
  const files = flattenFiles(fileTree)
  const toFetch: typeof files = []

  // Reuse cached content whenever Drive's modifiedTime hasn't moved since
  // it was cached — this is what makes repeat loads fast instead of
  // re-fetching every note's full body every single time.
  for (const file of files) {
    const cached = await getCachedContent(file.id)
    if (cached && file.modifiedTime && cached.modifiedTime === file.modifiedTime) {
      upsertDoc(index, await toDocWithEmbeds(file.id, file.name, cached.raw, fileTree))
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
          upsertDoc(index, await toDocWithEmbeds(file.id, file.name, raw, fileTree))
        } catch {
          // A single note failing to fetch (e.g. a transient auth hiccup
          // mid-index) shouldn't abort indexing the rest of the vault.
        }
      }),
    )
  }

  await persist(index)
  return index
}

// Finds the line a query term first appears on, for scroll-to-line
// targeting when a search result is opened — a plain case-insensitive
// substring scan, not tied to MiniSearch's own tokenization/stemming, so
// it may occasionally miss a fuzzy/stemmed match's exact line (falls back
// to the top of the note in that case, still better than nothing).
//
// Takes the *full* raw file (frontmatter included, same as what's cached)
// but returns a line number relative to the body only — data-src-line
// (plugin-source-line.ts) is computed from renderBody(content), which
// never sees the stripped-out frontmatter block, so a line number that
// didn't account for that offset would point at the wrong block entirely.
export function findMatchLine(rawFile: string, query: string): number | null {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return null
  const { content } = extractFrontmatter(rawFile)
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()
    if (terms.some((term) => line.includes(term))) return i
  }
  return null
}

// Precise counterpart to findMatchLine, for cross-note wikilink jumps
// ([[Note#Heading]] / [[Note^block-id]]) rather than a fuzzy search
// query — reuses the exact same slugify() the renderer used to generate
// heading ids, so it matches the same way a same-note heading jump
// already does via document.getElementById.
export function findWikilinkTargetLine(rawFile: string, heading?: string | null, blockId?: string | null): number | null {
  const { content } = extractFrontmatter(rawFile)
  const lines = content.split('\n')

  if (blockId) {
    const pattern = new RegExp(`\\s\\^${blockId}\\s*$`)
    const i = lines.findIndex((line) => pattern.test(line))
    if (i !== -1) return i
  }

  if (heading) {
    const targetSlug = slugify(heading)
    const i = lines.findIndex((line) => {
      const match = /^#{1,6}\s+(.*)$/.exec(line)
      return match ? slugify(match[1]) === targetSlug : false
    })
    if (i !== -1) return i
  }

  return null
}

// For the Tag Browser's "jump to this tag" click — a tag can appear more
// than once in the same note (indexed as a single use either way, see
// tags.service's Set-based dedup), so this deliberately just returns the
// *first* line it appears on, same "one good match, not every match"
// convention as findMatchLine/findWikilinkTargetLine above. Returns null
// for a tag that only exists in frontmatter (nothing inline to jump to) —
// the note still opens, just at the top instead of a specific line.
export function findTagLine(rawFile: string, tag: string): number | null {
  const { content } = extractFrontmatter(rawFile)
  const lines = content.split('\n')
  const i = lines.findIndex((line) => extractInlineTags(line).includes(tag))
  return i === -1 ? null : i
}

export async function updateIndexForNote(
  existing: MiniSearch<SearchDoc> | null,
  fileId: string,
  fileName: string,
  raw: string,
  fileTree: FileTreeNode[],
): Promise<MiniSearch<SearchDoc>> {
  const index = existing ?? createIndex()
  upsertDoc(index, await toDocWithEmbeds(fileId, fileName, raw, fileTree))
  await persist(index)
  return index
}
