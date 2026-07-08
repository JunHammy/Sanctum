import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardPaste } from 'lucide-react'
import { Modal } from './Modal'
import { importHtmlClip } from '../../services/html-clip-import.service'
import { useToastStore } from '../../stores/toast.store'
import { toUserMessage, logError } from '../../lib/error-messages'

interface WebClipModalProps {
  isOpen: boolean
  onClose: () => void
}

// Captures a browser's own copy-from-webpage clipboard payload — selecting
// content on a page and Ctrl+C puts both text/plain and text/html on the
// clipboard, and it's the text/html half this needs, not what a plain
// <input>/<textarea> would normally show. A textarea's paste event still
// carries the full clipboardData object regardless of what the element
// itself displays, so this reads that directly and blocks the default
// plain-text insertion rather than trying to capture rich content in a
// contentEditable div (avoids a whole separate class of browser quirks).
export function WebClipModal({ isOpen, onClose }: WebClipModalProps) {
  const [title, setTitle] = useState('')
  const [clippedHtml, setClippedHtml] = useState<string | null>(null)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const showToast = useToastStore((s) => s.show)
  const toastPromise = useToastStore((s) => s.promise)
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setClippedHtml(null)
      setPasteError(null)
    }
  }, [isOpen])

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    if (!html) {
      setPasteError('No rich content detected — copy directly from a web page (select text, Ctrl+C), not from a plain-text source.')
      return
    }
    setPasteError(null)
    setClippedHtml(html)
  }

  async function handleSubmit(e: FormEvent) {
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Paste web page">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="rounded-md border px-2.5 py-1.5 text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <textarea
          value={clippedHtml ? `Content captured — ${new DOMParser().parseFromString(clippedHtml, 'text/html').body.textContent?.trim().slice(0, 200) ?? ''}…` : ''}
          onPaste={handlePaste}
          onChange={() => {}}
          readOnly={clippedHtml !== null}
          placeholder="Select and copy content from a web page, then click here and paste (Ctrl+V)"
          rows={5}
          className="resize-none rounded-md border px-2.5 py-1.5 text-sm outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        {pasteError && (
          <p className="text-xs" style={{ color: 'var(--error)' }}>
            {pasteError}
          </p>
        )}
        {clippedHtml && (
          <button
            type="button"
            className="self-start text-xs hover:opacity-80"
            style={{ color: 'var(--accent-link)' }}
            onClick={() => setClippedHtml(null)}
          >
            Clear and paste something else
          </button>
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
            disabled={!title.trim() || !clippedHtml || isImporting}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--accent-link)', color: 'var(--bg-primary)' }}
          >
            <ClipboardPaste size={14} />
            {isImporting ? 'Importing…' : 'Create note'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
