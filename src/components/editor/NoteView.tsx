import { useNote } from '../../hooks/useNote'
import { MarkdownReader } from './MarkdownReader'
import { LoadingSpinner } from '../common/LoadingSpinner'
import { PropertiesPanel } from './PropertiesPanel'

export function NoteView({ fileId }: { fileId: string }) {
  const { html, frontmatter, isLoading, error } = useNote(fileId)

  if (isLoading) return <LoadingSpinner label="Loading note…" />
  if (error) return <p style={{ color: 'var(--error)' }}>{error}</p>

  return (
    <>
      <PropertiesPanel frontmatter={frontmatter} />
      <MarkdownReader html={html} currentFileId={fileId} />
    </>
  )
}
