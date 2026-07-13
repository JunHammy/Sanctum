import type { PersistedPythonOutput } from './python-syntax'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// A python block's persisted output, transcluded — same information
// PythonCodeBlock shows, but as a plain HTML string rather than a live
// React component. Deliberately read-only (no Run/Restart button): a
// transcluded block is someone else's note embedded read-only already
// (tables/math get the same treatment there), and re-running code from
// inside an embed isn't something that's been asked for — showing the
// result that's already saved is enough. Also sidesteps needing a portal
// into useTransclusion's raw `innerHTML` injection entirely, which this
// session already confirmed (twice) is a fragile pattern to lean on.
export function renderStaticPythonOutput(output: PersistedPythonOutput): string {
  const parts: string[] = []

  if (output.stdout) {
    parts.push(
      `<pre style="white-space:pre-wrap;margin:0;font-size:0.75rem;font-family:'JetBrains Mono','Fira Code',monospace;color:var(--text-primary)">${escapeHtml(output.stdout)}</pre>`,
    )
  }
  if (output.stderr) {
    parts.push(
      `<pre style="white-space:pre-wrap;margin:0.25rem 0 0;font-size:0.75rem;font-family:'JetBrains Mono','Fira Code',monospace;color:var(--warning)">${escapeHtml(output.stderr)}</pre>`,
    )
  }
  if (output.errorMessage) {
    parts.push(
      `<pre style="white-space:pre-wrap;margin:0.25rem 0 0;font-size:0.75rem;font-family:'JetBrains Mono','Fira Code',monospace;color:var(--error)">${escapeHtml(output.errorMessage)}</pre>`,
    )
  }
  for (const base64 of output.images) {
    parts.push(`<img src="data:image/png;base64,${base64}" alt="Figure" style="margin-top:0.5rem;max-width:100%;border-radius:4px;display:block" />`)
  }

  if (parts.length === 0) return ''
  // border-top divider, matching PythonCodeBlock's own "output half of one
  // cell" convention — .python-block's own CSS already gives the whole
  // block rounded corners + overflow:hidden, which auto-clips this as the
  // last child without needing its own rounding here.
  return `<div style="border-top:1px solid var(--border);background:var(--bg-secondary);padding:0.5rem 0.75rem">${parts.join('')}</div>`
}
