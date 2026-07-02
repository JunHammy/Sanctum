import { useEffect, useRef, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVaultStore } from '../../stores/vault.store'
import { resolveWikilink } from '../../lib/wikilink-resolver'
import { findAttachmentByName, isRelativeImagePath } from '../../lib/image-resolver'
import { slugify } from '../../services/markdown.service'
import { readFileBlob } from '../../services/drive.service'
import type { FileTreeNode } from '../../types/vault.types'

function flashScrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('heading-flash')
  setTimeout(() => el.classList.remove('heading-flash'), 1500)
}

// Vault images are relative paths in the rendered HTML (![](assets/x.png))
// — resolve them to Drive blob URLs after mount, since it requires network
// calls that renderNote() itself stays synchronous and free of.
function useImageResolution(containerRef: React.RefObject<HTMLDivElement | null>, html: string, fileTree: FileTreeNode[]) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // StrictMode runs effects twice in dev (mount, cleanup, mount again);
    // this guard stops a stale first-pass fetch from overwriting img.src
    // after the second pass's fetch already won.
    let cancelled = false
    const objectUrls: string[] = []
    const images = container.querySelectorAll('img')

    console.info(`[image-resolution] found ${images.length} <img> tag(s) to check`)

    images.forEach((img) => {
      const src = img.getAttribute('src')
      if (!src || !isRelativeImagePath(src)) return

      const filename = src.split('/').pop()
      if (!filename) return

      const fileId = findAttachmentByName(fileTree, filename)
      if (!fileId) {
        console.warn(`[image-resolution] "${filename}" not found anywhere in the vault`)
        img.alt = `${img.alt} (not found in vault)`.trim()
        return
      }

      readFileBlob(fileId)
        .then((blob) => {
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          objectUrls.push(url)
          img.src = url
          console.info(`[image-resolution] "${filename}" resolved (${blob.type || 'unknown type'}, ${blob.size} bytes)`)
        })
        .catch((err) => {
          if (cancelled) return
          console.error(`[image-resolution] "${filename}" failed to fetch:`, err)
          img.alt = `${img.alt} (failed to load)`.trim()
        })
    })

    return () => {
      cancelled = true
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [containerRef, html, fileTree])
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
  const containerRef = useRef<HTMLDivElement>(null)

  useImageResolution(containerRef, html, fileTree)

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
