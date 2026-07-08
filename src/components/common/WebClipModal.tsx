import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardPaste, Link2 } from 'lucide-react'
import { Modal } from './Modal'
import { importHtmlClip } from '../../services/html-clip-import.service'
import { scrapeUrl } from '../../services/web-clip-scrape.service'
import { useToastStore } from '../../stores/toast.store'
import { toUserMessage, logError } from '../../lib/error-messages'

interface WebClipModalProps {
  isOpen: boolean
  onClose: () => void
}

type Mode = 'link' | 'paste'

// Two ways to bring a web page in as a note, sharing one final review step
// (title + "content captured" confirmation + Create button) once content
// has been captured either way:
//
// - Link (primary): paste a URL, the Worker fetches it server-side (past
//   the browser's CORS block) and @mozilla/readability extracts just the
//   article. No manual selection needed.
// - Paste (fallback): select and copy content from a page yourself. Still
//   needed for sites the scraper can't reach — bot-walled, paywalled, or
//   JavaScript-rendered pages the Worker's plain fetch never sees rendered.
//
// The title is always shown for review before creating the note, not
// auto-applied silently — Sanctum has no note-rename feature yet, so a bad
// auto-extracted title would otherwise be stuck permanently.
export function WebClipModal({ isOpen, onClose }: WebClipModalProps) {
  const [mode, setMode] = useState<Mode>('link')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [clippedHtml, setClippedHtml] = useState<string | null>(null)
  const [contentError, setContentError] = useState<string | null>(null)
  const [isScraping, setIsScraping] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const showToast = useToastStore((s) => s.show)
  const toastPromise = useToastStore((s) => s.promise)
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen) {
      setMode('link')
      setUrl('')
      setTitle('')
      setClippedHtml(null)
      setContentError(null)
    }
  }, [isOpen])

  function switchMode(next: Mode) {
    setMode(next)
    setClippedHtml(null)
    setContentError(null)
    setTitle('')
  }

  async function handleFetch(e: FormEvent) {
    e.preventDefault()
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return

    setIsScraping(true)
    setContentError(null)
    try {
      const article = await scrapeUrl(trimmedUrl)
      setTitle(article.title)
      setClippedHtml(article.html)
    } catch (err) {
      logError('webClip.scrape', err)
      setContentError(toUserMessage(err, 'Could not import that page.'))
    } finally {
      setIsScraping(false)
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    if (!html) {
      setContentError('No rich content detected — copy directly from a web page (select text, Ctrl+C), not from a plain-text source.')
      return
    }
    setContentError(null)
    setClippedHtml(html)
    // Paste has no page title to draw from — leaves the title field for the
    // user to fill in themselves, same as New Note already works.
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle || !clippedHtml) return

    setIsImporting(true)
    try {
      const id = await toastPromise(() => importHtmlClip(clippedHtml, trimmedTitle), {
        loading: `Importing "${trimmedTitle}"…`,
        success: `Imported "${trimmedTitle}"`,
        error: (err) => toUserMessage(err, `Could not import "${trimmedTitle}".`),
      })
      onClose()
      navigate(`/vault/note/${id}`)
    } catch (err) {
      logError('webClip.import', err)
      showToast(toUserMessage(err, 'Could not import that page.'), 'error')
    } finally {
      setIsImporting(false)
    }
  }

  const capturedPreview = clippedHtml
    ? new DOMParser().parseFromString(clippedHtml, 'text/html').body.textContent?.trim().slice(0, 200)
    : ''

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import from the web">
      <div className="mb-3 flex gap-1 rounded-md border p-0.5" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-sm"
          style={{
            background: mode === 'link' ? 'var(--bg-tertiary)' : undefined,
            color: mode === 'link' ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
          onClick={() => switchMode('link')}
        >
          <Link2 size={14} />
          Link
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-sm"
          style={{
            background: mode === 'paste' ? 'var(--bg-tertiary)' : undefined,
            color: mode === 'paste' ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
          onClick={() => switchMode('paste')}
        >
          <ClipboardPaste size={14} />
          Paste
        </button>
      </div>

      {!clippedHtml && mode === 'link' && (
        <form onSubmit={handleFetch} className="flex flex-col gap-3">
          <input
            type="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/an-article"
            className="rounded-md border px-2.5 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Fetches the page and pulls out just the article — nav, ads, and sidebars are stripped automatically.
          </p>
          {contentError && (
            <p className="text-xs" style={{ color: 'var(--error)' }}>
              {contentError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim() || isScraping}
              className="rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--accent-link)', color: 'var(--bg-primary)' }}
            >
              {isScraping ? 'Fetching…' : 'Fetch'}
            </button>
          </div>
        </form>
      )}

      {!clippedHtml && mode === 'paste' && (
        <div className="flex flex-col gap-3">
          <textarea
            onPaste={handlePaste}
            onChange={() => {}}
            placeholder="Select and copy content from a web page, then click here and paste (Ctrl+V)"
            rows={5}
            className="resize-none rounded-md border px-2.5 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          />
          {contentError && (
            <p className="text-xs" style={{ color: 'var(--error)' }}>
              {contentError}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {clippedHtml && (
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Content captured — {capturedPreview}…
          </p>
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            className="rounded-md border px-2.5 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          />
          <button
            type="button"
            className="self-start text-xs hover:opacity-80"
            style={{ color: 'var(--accent-link)' }}
            onClick={() => {
              setClippedHtml(null)
              setTitle('')
            }}
          >
            Start over
          </button>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isImporting}
              className="rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--accent-link)', color: 'var(--bg-primary)' }}
            >
              {isImporting ? 'Importing…' : 'Create note'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
