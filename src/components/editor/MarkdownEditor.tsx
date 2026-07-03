import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { livePreviewExtension } from '../../lib/codemirror/live-preview'
import { customSyntaxExtension } from '../../lib/codemirror/custom-syntax-decorations'
import { slashCommandsExtension } from '../../lib/codemirror/slash-commands'
import '../../styles/codemirror-live-preview.css'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
}

// Uncontrolled by design: CodeMirror owns its own text state internally,
// and this component only reports changes out via onChange — it doesn't
// sync external `value` changes back in after mount (that would fight the
// user's cursor position while typing). The parent is expected to force a
// fresh instance per note via `key={fileId}`, not feed it live updates.
export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.lineWrapping,
        livePreviewExtension,
        customSyntaxExtension,
        slashCommandsExtension,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
      parent: containerRef.current,
    })

    return () => view.destroy()
  }, [])

  return <div ref={containerRef} className="cm-editor-wrapper overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }} />
}
