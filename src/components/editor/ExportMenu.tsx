import { useState } from 'react'
import { FileDown, FileText, FileType } from 'lucide-react'
import { Modal } from '../common/Modal'
import { downloadNoteMarkdown, exportNoteToPDF } from '../../services/export.service'
import { exportNoteToDocx } from '../../services/docx-export.service'
import { useVaultStore } from '../../stores/vault.store'
import { useToastStore } from '../../stores/toast.store'
import { findFileName } from '../../lib/vault-tree'

interface ExportMenuProps {
  fileId: string
  isOpen: boolean
  onClose: () => void
}

type ExportFormat = 'pdf' | 'docx'

// Same Modal-as-action-sheet shape as RevisionsPanel — a choice of a few
// items doesn't need a full custom dropdown component, and this way it
// gets click-outside/Escape-to-close for free.
export function ExportMenu({ fileId, isOpen, onClose }: ExportMenuProps) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const toastPromise = useToastStore((s) => s.promise)
  // One flag covering both formats (not a separate bool each) — exporting
  // either one disables every option here, so a second export can't start
  // while the first is still mid-flight.
  const [exporting, setExporting] = useState<ExportFormat | null>(null)

  const title = (findFileName(fileTree, fileId) ?? 'Untitled').replace(/\.md$/, '')

  async function handleMarkdown() {
    try {
      await toastPromise(() => downloadNoteMarkdown(fileId, title), {
        loading: 'Downloading…',
        success: 'Markdown downloaded',
        error: 'Failed to download note',
      })
      onClose()
    } catch {
      // toastPromise already surfaced the error toast.
    }
  }

  async function handlePdf() {
    setExporting('pdf')
    try {
      await toastPromise(() => exportNoteToPDF(fileId, title, fileTree), {
        loading: 'Exporting PDF…',
        success: 'PDF exported',
        error: 'Failed to export PDF',
      })
      onClose()
    } catch {
      // toastPromise already surfaced the error toast.
    } finally {
      setExporting(null)
    }
  }

  async function handleDocx() {
    setExporting('docx')
    try {
      await toastPromise(() => exportNoteToDocx(fileId, title, fileTree), {
        loading: 'Exporting Word document…',
        success: 'Word document exported',
        error: 'Failed to export Word document',
      })
      onClose()
    } catch {
      // toastPromise already surfaced the error toast.
    } finally {
      setExporting(null)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export note">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className="flex items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
          onClick={handleMarkdown}
          disabled={exporting !== null}
        >
          <FileText size={16} style={{ color: 'var(--text-muted)' }} />
          <span>
            <span className="block" style={{ color: 'var(--text-primary)' }}>
              Download Markdown
            </span>
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
              The raw .md file, as saved
            </span>
          </span>
        </button>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
          onClick={handlePdf}
          disabled={exporting !== null}
        >
          <FileDown size={16} style={{ color: 'var(--text-muted)' }} />
          <span>
            <span className="block" style={{ color: 'var(--text-primary)' }}>
              {exporting === 'pdf' ? 'Exporting…' : 'Export as PDF'}
            </span>
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
              Rendered note, with embeds and images resolved
            </span>
          </span>
        </button>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
          onClick={handleDocx}
          disabled={exporting !== null}
        >
          <FileType size={16} style={{ color: 'var(--text-muted)' }} />
          <span>
            <span className="block" style={{ color: 'var(--text-primary)' }}>
              {exporting === 'docx' ? 'Exporting…' : 'Export as Word Doc'}
            </span>
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
              Editable .docx — math and syntax highlighting shown as plain text
            </span>
          </span>
        </button>
      </div>
    </Modal>
  )
}
