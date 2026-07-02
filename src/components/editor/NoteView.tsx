import { useNote } from '../../hooks/useNote'
import { MarkdownReader } from './MarkdownReader'
import { LoadingSpinner } from '../common/LoadingSpinner'

export function NoteView({ fileId }: { fileId: string }) {
  const { html, isLoading, error } = useNote(fileId)

  if (isLoading) return <LoadingSpinner label="Loading note…" />
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>

  return <MarkdownReader html={html} currentFileId={fileId} />
}
