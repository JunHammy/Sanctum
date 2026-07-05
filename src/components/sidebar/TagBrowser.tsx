import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Tag as TagIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useTagsStore } from '../../stores/tags.store'
import { useVaultStore } from '../../stores/vault.store'
import { useNoteStore } from '../../stores/note.store'
import { useUIStore } from '../../stores/ui.store'
import { findFileName } from '../../lib/vault-tree'
import { findTagLine } from '../../services/search.service'
import { readFile } from '../../services/drive.service'

// Sits below the file tree — collapsible, same chrome/animation language as
// PropertiesPanel/TableOfContents/FileTreeNode. Aggregates both frontmatter
// `tags:` and inline `#tag` (tags.store, built/updated the same way search
// indexing and backlinks are).
export function TagBrowser() {
  const map = useTagsStore((s) => s.map)
  const fileTree = useVaultStore((s) => s.fileTree)
  const closeSidebar = useUIStore((s) => s.closeSidebar)
  const navigate = useNavigate()
  const [sectionExpanded, setSectionExpanded] = useState(false)
  const [openTag, setOpenTag] = useState<string | null>(null)

  const tags = useMemo(
    () =>
      Array.from(map.entries())
        .map(([tag, ids]) => ({ tag, ids }))
        .sort((a, b) => a.tag.localeCompare(b.tag)),
    [map],
  )

  if (tags.length === 0) return null

  // Fetched fresh, not from the IndexedDB content cache — same reasoning as
  // SearchModal/MarkdownReader's cross-note jumps: that cache only refreshes
  // on the next full vault reindex, not on every save, so it can miss a
  // tag that was just added or moved. Sets pendingScroll (note.store) before
  // navigating so MarkdownReader's existing jump-and-flash effect picks it
  // up once the note's content lands — same mechanism search results and
  // wikilinks already use, not a new one.
  //
  // enterReadMode is the load-bearing extra step here versus those other
  // jumps: this panel is reachable regardless of whether the currently open
  // note is in Read or Edit mode. If you click a tag belonging to the note
  // you're *already* editing, navigate() to the same URL doesn't re-trigger
  // openNote (which is what normally resets to Read mode on a real note
  // switch) — without forcing it here, MarkdownReader (where the highlight
  // effect lives) would simply never mount, and the jump would silently do
  // nothing.
  async function handleOpenNote(id: string, tag: string) {
    try {
      const raw = await readFile(id)
      const line = findTagLine(raw, tag)
      if (line !== null) useNoteStore.getState().setPendingScroll({ fileId: id, line })
    } catch {
      // Falls through to just opening the note at the top.
    }
    useNoteStore.getState().enterReadMode()
    navigate(`/vault/note/${id}`)
    if (window.innerWidth < 1024) closeSidebar()
  }

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1 text-xs font-medium tracking-wide uppercase hover:opacity-80"
        style={{ color: 'var(--text-muted)' }}
        onClick={() => setSectionExpanded((v) => !v)}
      >
        <motion.span
          className="inline-flex shrink-0"
          animate={{ rotate: sectionExpanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronRight size={12} />
        </motion.span>
        <TagIcon size={12} />
        Tags ({tags.length})
      </button>
      <AnimatePresence initial={false}>
        {sectionExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col gap-0.5 pt-1 pb-1">
              {tags.map(({ tag, ids }) => (
                <div key={tag}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-1.5 truncate rounded px-2 py-1 text-left text-sm hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--accent-tag)' }}
                    onClick={() => setOpenTag((v) => (v === tag ? null : tag))}
                  >
                    <span className="truncate">#{tag}</span>
                    <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {ids.length}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {openTag === tag && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <ul className="flex flex-col gap-0.5 py-1 pl-6">
                          {ids.map((id) => (
                            <li key={id}>
                              <button
                                type="button"
                                className="block w-full truncate rounded px-2 py-0.5 text-left text-sm hover:bg-[var(--bg-tertiary)]"
                                style={{ color: 'var(--text-secondary)' }}
                                onClick={() => handleOpenNote(id, tag)}
                              >
                                {(findFileName(fileTree, id) ?? id).replace(/\.md$/, '')}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
