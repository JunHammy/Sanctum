import { useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, X, Plus } from 'lucide-react'
import { useNoteStore } from '../../stores/note.store'

function toEditableString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

function TagsDisplay({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded px-1.5 py-0.5 text-xs"
          style={{ color: 'var(--accent-tag)', background: 'var(--bg-tertiary)' }}
        >
          #{tag}
        </span>
      ))}
    </div>
  )
}

function TagsEditor({ tags }: { tags: string[] }) {
  const updateFrontmatterField = useNoteStore((s) => s.updateFrontmatterField)
  const [draft, setDraft] = useState('')

  function addTag() {
    const tag = draft.trim().replace(/^#/, '')
    if (!tag || tags.includes(tag)) {
      setDraft('')
      return
    }
    updateFrontmatterField('tags', [...tags, tag])
    setDraft('')
  }

  function removeTag(tag: string) {
    updateFrontmatterField(
      'tags',
      tags.filter((t) => t !== tag),
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
          style={{ color: 'var(--accent-tag)', background: 'var(--bg-tertiary)' }}
        >
          #{tag}
          <button type="button" aria-label={`Remove ${tag}`} onClick={() => removeTag(tag)} className="hover:opacity-70">
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addTag()
          }
        }}
        onBlur={addTag}
        placeholder="add tag…"
        className="w-20 border-none bg-transparent text-xs outline-none"
        style={{ color: 'var(--text-muted)' }}
      />
    </div>
  )
}

function EditableValue({ propKey, value, readOnly }: { propKey: string; value: unknown; readOnly: boolean }) {
  const updateFrontmatterField = useNoteStore((s) => s.updateFrontmatterField)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (propKey === 'tags' && Array.isArray(value)) {
    return readOnly ? <TagsDisplay tags={value.map(String)} /> : <TagsEditor tags={value.map(String)} />
  }

  if (readOnly) {
    return <span className="block">{toEditableString(value)}</span>
  }

  if (isEditing) {
    function commit() {
      updateFrontmatterField(propKey, draft)
      setIsEditing(false)
    }
    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Enter') commit()
      if (e.key === 'Escape') setIsEditing(false)
    }
    return (
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="w-full border-b bg-transparent text-sm outline-none"
        style={{ borderColor: 'var(--accent-link)', color: 'var(--text-primary)' }}
      />
    )
  }

  return (
    <span
      className="block cursor-text rounded hover:bg-[var(--bg-tertiary)]"
      onClick={() => {
        setDraft(toEditableString(value))
        setIsEditing(true)
      }}
    >
      {toEditableString(value)}
    </span>
  )
}

function AddPropertyRow() {
  const updateFrontmatterField = useNoteStore((s) => s.updateFrontmatterField)
  const [isAdding, setIsAdding] = useState(false)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  if (!isAdding) {
    return (
      <button
        type="button"
        className="col-span-2 flex items-center gap-1 py-1 text-xs opacity-60 hover:opacity-100"
        style={{ color: 'var(--text-secondary)' }}
        onClick={() => setIsAdding(true)}
      >
        <Plus size={12} />
        Add property
      </button>
    )
  }

  function commit() {
    const trimmedKey = key.trim()
    if (trimmedKey) updateFrontmatterField(trimmedKey, value.trim())
    setKey('')
    setValue('')
    setIsAdding(false)
  }

  return (
    <div className="col-span-2 flex items-center gap-2">
      <input
        type="text"
        autoFocus
        placeholder="key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className="w-24 rounded border px-1.5 py-0.5 text-xs outline-none"
        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      />
      <input
        type="text"
        placeholder="value"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        onBlur={commit}
        className="flex-1 rounded border px-1.5 py-0.5 text-xs outline-none"
        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      />
    </div>
  )
}

// Editing follows the same "click to activate, click/blur away to commit"
// language as blocks, for consistency across the app.
export function PropertiesPanel() {
  const frontmatter = useNoteStore((s) => s.frontmatter)
  const removeFrontmatterField = useNoteStore((s) => s.removeFrontmatterField)
  const isReadMode = useNoteStore((s) => s.isReadMode)
  const [expanded, setExpanded] = useState(true)
  const entries = Object.entries(frontmatter).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  )

  return (
    <div className="mb-6 rounded-md border" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium tracking-wide uppercase hover:opacity-80"
        style={{ color: 'var(--text-muted)' }}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Properties
      </button>
      {expanded && (
        <dl className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2 px-3 pb-3 text-sm">
          {entries.map(([key, value]) => (
            <div key={key} className="group contents">
              <dt className="flex items-center gap-1 pt-0.5 capitalize" style={{ color: 'var(--text-muted)' }}>
                {key}
              </dt>
              <dd className="flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                <div className="flex-1">
                  <EditableValue propKey={key} value={value} readOnly={isReadMode} />
                </div>
                {!isReadMode && (
                  <button
                    type="button"
                    aria-label={`Remove ${key}`}
                    className="opacity-0 hover:opacity-70 group-hover:opacity-40"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => removeFrontmatterField(key)}
                  >
                    <X size={12} />
                  </button>
                )}
              </dd>
            </div>
          ))}
          {!isReadMode && <AddPropertyRow />}
        </dl>
      )}
    </div>
  )
}
