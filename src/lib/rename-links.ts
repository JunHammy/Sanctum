import * as driveService from '../services/drive.service'
import { extractFrontmatter } from '../services/markdown.service'
import { flattenFiles } from '../services/search.service'
import { getCachedContent, setCachedContent } from '../services/cache.service'
import { resolveWikilink } from './wikilink-resolver'
import { parseWikilinkInner } from './wikilink-syntax'
import { useSearchStore } from '../stores/search.store'
import { useBacklinksStore } from '../stores/backlinks.store'
import { useTagsStore } from '../stores/tags.store'
import type { FileTreeNode } from '../types/vault.types'

// Same batch size as search.service/backlinks.service's own indexers, for
// the same reason — personal vault scale, but no need to fire every note's
// fetch at once either.
const FETCH_BATCH_SIZE = 8
const WIKILINK_PATTERN = /(!)?\[\[([^\]]+)\]\]/g

export interface RenameLinksResult {
  updatedNoteCount: number
  linksUpdated: number
}

// Rewrites every `[[...]]` occurrence (never `![[...]]` embeds — matches
// extractWikilinkTargets' own convention) that resolves to renamedFileId,
// preserving whatever heading/block-id/alias suffix it already had. Resolves
// through resolveWikilink (not naive text matching) against treeForResolution
// — the tree as it existed *before* the rename — so a link is only rewritten
// if it genuinely used to point at this note, never a different note that
// happens to share a name prefix.
function rewriteContent(
  content: string,
  renamedFileId: string,
  newName: string,
  treeForResolution: FileTreeNode[],
): { content: string; count: number } {
  let count = 0
  const rewritten = content.replace(WIKILINK_PATTERN, (full, bang: string, inner: string) => {
    if (bang === '!') return full
    const { target, heading, blockId, alias } = parseWikilinkInner(inner)
    if (!target) return full
    if (resolveWikilink(target, treeForResolution) !== renamedFileId) return full

    count++
    let rebuilt = newName
    if (blockId) rebuilt += `^${blockId}`
    else if (heading) rebuilt += `#${heading}`
    if (alias) rebuilt += `|${alias}`
    return `[[${rebuilt}]]`
  })
  return { content: rewritten, count }
}

// Scans every note in the vault for [[...]] links pointing at renamedFileId
// (resolved against its old name) and rewrites them to newName, saving and
// re-indexing any note that changed. Called both for an in-app sidebar
// rename and for a rename detected as having happened directly in Google
// Drive — the caller decides whether to also issue the Drive rename call
// itself; this function only ever fixes up *other* notes' links.
export async function fixLinksAfterRename(
  renamedFileId: string,
  newName: string,
  treeForResolution: FileTreeNode[],
  currentFileTree: FileTreeNode[],
): Promise<RenameLinksResult> {
  const files = flattenFiles(currentFileTree).filter((f) => f.id !== renamedFileId)
  const rawByFileId = new Map<string, string>()
  const toFetch: typeof files = []

  for (const file of files) {
    const cached = await getCachedContent(file.id)
    if (cached && file.modifiedTime && cached.modifiedTime === file.modifiedTime) {
      rawByFileId.set(file.id, cached.raw)
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
          rawByFileId.set(file.id, raw)
        } catch {
          // One note failing to fetch shouldn't block fixing the rest —
          // it just keeps its stale link until a future rename pass.
        }
      }),
    )
  }

  let updatedNoteCount = 0
  let linksUpdated = 0

  for (const file of files) {
    const raw = rawByFileId.get(file.id)
    if (raw === undefined) continue

    const { content, frontmatterBlock } = extractFrontmatter(raw)
    const { content: rewrittenContent, count } = rewriteContent(content, renamedFileId, newName, treeForResolution)
    if (count === 0) continue

    const newRaw = frontmatterBlock + rewrittenContent
    try {
      const updated = await driveService.updateFile(file.id, newRaw)
      if (updated.modifiedTime) await setCachedContent(file.id, { raw: newRaw, modifiedTime: updated.modifiedTime })
      updatedNoteCount++
      linksUpdated += count
      await useSearchStore.getState().updateIndexForNote(file.id, newRaw)
      await useBacklinksStore.getState().updateForNote(file.id, newRaw, currentFileTree)
      await useTagsStore.getState().updateForNote(file.id, newRaw)
    } catch {
      // Failed to save this note's fix-up — leave it for a future rename
      // pass rather than aborting the rest of the vault scan.
    }
  }

  return { updatedNoteCount, linksUpdated }
}
