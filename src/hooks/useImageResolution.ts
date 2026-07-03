import { useEffect } from 'react'
import { findAttachmentByName, isRelativeImagePath } from '../lib/image-resolver'
import { readFileBlob } from '../services/drive.service'
import type { FileTreeNode } from '../types/vault.types'

// Vault images are relative paths in the rendered HTML (![](assets/x.png))
// — resolve them to Drive blob URLs after mount, since it requires network
// calls that renderNote()/renderBody() themselves stay synchronous and free
// of. Shared by MarkdownReader (whole-document read mode) and Block (a
// single block's inactive/rendered state in the block editor).
export function useImageResolution(containerRef: React.RefObject<HTMLDivElement | null>, html: string, fileTree: FileTreeNode[]) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // StrictMode runs effects twice in dev (mount, cleanup, mount again);
    // this guard stops a stale first-pass fetch from overwriting img.src
    // after the second pass's fetch already won.
    let cancelled = false
    const objectUrls: string[] = []
    const images = container.querySelectorAll('img')

    images.forEach((img) => {
      const src = img.getAttribute('src')
      if (!src || !isRelativeImagePath(src)) return

      const filename = src.split('/').pop()
      if (!filename) return

      const fileId = findAttachmentByName(fileTree, filename)
      if (!fileId) {
        img.alt = `${img.alt} (not found in vault)`.trim()
        return
      }

      readFileBlob(fileId)
        .then((blob) => {
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          objectUrls.push(url)
          img.src = url
        })
        .catch(() => {
          if (cancelled) return
          img.alt = `${img.alt} (failed to load)`.trim()
        })
    })

    return () => {
      cancelled = true
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [containerRef, html, fileTree])
}
