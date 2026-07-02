import { useNote } from '../../hooks/useNote'
import { MarkdownReader } from './MarkdownReader'

export function NoteView({ fileId }: { fileId: string }) {
  const { html, isLoading, error } = useNote(fileId)

  if (isLoading) return <p style={{ color: 'var(--text-secondary)' }}>Loading note…</p>
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>

  return <MarkdownReader html={html} />
}
