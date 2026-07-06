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
  const showToast = useToastStore((s) => s.show)
  // One flag covering both formats (not a separate bool each) — exporting
  // either one disables every option here, so a second export can't start
  // while the first is still mid-flight.
  const [exporting, setExporting] = useState<ExportFormat | null>(null)

  const title = (findFileName(fileTree, fileId) ?? 'Untitled').replace(/\.md$/, '')

  async function handleMarkdown() {
    try {
      await downloadNoteMarkdown(fileId, title)
      onClose()
    } catch {
      showToast('Failed to download note', 'error')
    }
  }

  async function handlePdf() {
    setExporting('pdf')
    try {
      await exportNoteToPDF(fileId, title, fileTree)
      onClose()
    } catch {
      showToast('Failed to export PDF', 'error')
    } finally {
      setExporting(null)
    }
  }

  async function handleDocx() {
    setExporting('docx')
    try {
      await exportNoteToDocx(fileId, title, fileTree)
      onClose()
    } catch {
      showToast('Failed to export Word document', 'error')
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
