import { useRef, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVaultStore } from '../../stores/vault.store'
import { resolveWikilink } from '../../lib/wikilink-resolver'
import { slugify } from '../../services/markdown.service'
import { useImageResolution } from '../../hooks/useImageResolution'

function flashScrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('heading-flash')
  setTimeout(() => el.classList.remove('heading-flash'), 1500)
}

interface MarkdownReaderProps {
  html: string
  currentFileId: string
}

// html comes from our own markdown-it pipeline (a note this user wrote), not
// arbitrary third-party content, so injecting it directly is fine here.
export function MarkdownReader({ html, currentFileId }: MarkdownReaderProps) {
  const navigate = useNavigate()
  const fileTree = useVaultStore((s) => s.fileTree)
  const isVaultLoading = useVaultStore((s) => s.isLoading)
  const containerRef = useRef<HTMLDivElement>(null)

  useImageResolution(containerRef, fileTree, isVaultLoading)

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const link = (e.target as HTMLElement).closest('.wikilink')
    if (!link) return
    e.preventDefault()

    const target = link.getAttribute('data-target')
    if (!target) return
    const heading = link.getAttribute('data-heading')
    const blockId = link.getAttribute('data-block')

    const fileId = resolveWikilink(target, fileTree)
    if (!fileId) {
      console.info('Wikilink target not found in vault:', target)
      return
    }

    if (fileId === currentFileId && (heading || blockId)) {
      // Same note: scroll directly, no navigation needed. Block ids are
      // used verbatim (user-authored, already id-safe); headings need the
      // same slugify() the renderer used to generate their id.
      flashScrollTo(blockId || slugify(heading!))
    } else {
      navigate(`/vault/note/${fileId}`)
      // Cross-note heading/block scroll isn't implemented yet — this lands
      // at the top of the target note. Needs to wait for that note to
      // finish loading before the target element exists to scroll to.
    }
  }

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
