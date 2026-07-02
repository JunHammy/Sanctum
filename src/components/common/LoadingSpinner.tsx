interface LoadingSpinnerProps {
  label?: string
  size?: number
}

export function LoadingSpinner({ label, size = 20 }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <span
        className="inline-block animate-spin rounded-full border-2"
        style={{
          width: size,
          height: size,
          borderColor: 'var(--border)',
          borderTopColor: 'var(--accent-link)',
        }}
      />
      {label && (
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
      )}
    </div>
  )
}
