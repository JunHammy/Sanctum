import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface PropertiesPanelProps {
  frontmatter: Record<string, unknown>
}

function PropertyValue({ propKey, value }: { propKey: string; value: unknown }) {
  if (propKey === 'tags' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        {value.map((tag) => (
          <span key={String(tag)} style={{ color: 'var(--accent-tag)' }}>
            #{String(tag)}
          </span>
        ))}
      </div>
    )
  }

  // js-yaml parses ISO-8601-looking scalars (e.g. "created: 2026-01-15")
  // into real Date objects, not strings — format them instead of falling
  // through to Date's verbose toString().
  if (value instanceof Date) {
    return <span>{value.toLocaleDateString()}</span>
  }

  if (Array.isArray(value)) {
    return <span>{value.map(String).join(', ')}</span>
  }

  return <span>{String(value)}</span>
}

// Display-only for now — editing frontmatter needs the CodeMirror editor,
// which is Phase 2. Phase 1 is read-only, so this just shows what's parsed.
export function PropertiesPanel({ frontmatter }: PropertiesPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const entries = Object.entries(frontmatter).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  )

  if (entries.length === 0) return null

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
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-3 pb-3 text-sm">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="capitalize" style={{ color: 'var(--text-muted)' }}>
                {key}
              </dt>
              <dd style={{ color: 'var(--text-primary)' }}>
                <PropertyValue propKey={key} value={value} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
