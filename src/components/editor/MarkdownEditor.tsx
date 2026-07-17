import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { tooltips } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { indentUnit } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { livePreviewExtension } from '../../lib/codemirror/live-preview'
import { customSyntaxExtension } from '../../lib/codemirror/custom-syntax-decorations'
import { slashCommandsExtension } from '../../lib/codemirror/slash-commands'
import { wikilinkAutocompleteExtension } from '../../lib/codemirror/wikilink-autocomplete'
import { imageUploadExtension } from '../../lib/codemirror/image-upload'
import '../../styles/codemirror-live-preview.css'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  // Skips this component's own border/rounding — set by a caller that's
  // wrapping this editor together with something else (Block.tsx's python
  // Run panel) inside one shared bordered container, so there isn't a
  // visible double border/gap at the seam between the two.
  bare?: boolean
  // 'python'/'javascript' swap markdown syntax mode for real syntax
  // highlighting (keywords, strings, etc. — matching what Read mode's
  // highlight.js already shows, instead of plain unstyled text) and drop
  // every markdown-specific extension below (slash commands, wikilink
  // autocomplete, image paste, live-preview decorations) — none of those
  // make sense once this buffer holds nothing but raw code, and leaving
  // them active risked real misfires (typing `/` for division opening the
  // slash-command menu, `[[` in a dict/list/array literal opening the
  // wikilink dropdown). Only used by Block.tsx for a runnable code block's
  // isolated code buffer (see its own `parsedPython`/`parsedJavaScript`) —
  // every other caller keeps the default markdown mode.
  language?: 'markdown' | 'python' | 'javascript'
}

// Uncontrolled by design: CodeMirror owns its own text state internally,
// and this component only reports changes out via onChange — it doesn't
// sync external `value` changes back in after mount (that would fight the
// user's cursor position while typing). The parent is expected to force a
// fresh instance via `key` whenever `value` needs to authoritatively
// change out from under it (a note switch via `key={fileId}`, or a python
// block's classification flipping — see Block.tsx's own `key` on this
// component for that second case), not feed it live updates through props.
export function MarkdownEditor({ value, onChange, bare, language = 'markdown' }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    const languageExtensions: Extension[] =
      language === 'python'
        ? [python(), indentUnit.of('    ')] // PEP8 (4 spaces) — CodeMirror's own default is 2
        : language === 'javascript'
          ? [javascript()] // CodeMirror's own default indentUnit (2 spaces) already matches common JS style, no override needed
          : [markdown(), livePreviewExtension, customSyntaxExtension, slashCommandsExtension, wikilinkAutocompleteExtension, imageUploadExtension]

    const view = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        oneDark,
        EditorView.lineWrapping,
        // Confirmed real bug via testing (Windows 11, reproduced in *any*
        // block, not something specific to chart/diagram fences): without
        // these turned off, Windows' own hardware-keyboard "Text
        // Suggestions" (predictive text) feature can activate inside
        // CodeMirror's contenteditable region, since nothing here told it
        // this wasn't an ordinary plain-text field. Once that candidate UI
        // shows, Enter and the arrow keys navigate/accept *its* suggestions
        // instead of doing their normal editor thing — which reads exactly
        // like "Enter doesn't add a line, arrow keys undo it, content
        // grows and collapses unpredictably," despite CodeMirror's own
        // document/transaction logic never actually doing anything wrong.
        EditorView.contentAttributes.of({ autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' }),
        // Blocks live inside position:relative wrappers (BlockEditor's
        // per-block container), which CodeMirror would otherwise adopt as
        // the tooltip's offsetParent — forcing autocomplete/slash-command
        // dropdowns into a broken absolute-positioned, clipped state
        // instead of the normal viewport-fixed one. Anchoring to <body>
        // sidesteps any local positioning/overflow context entirely.
        tooltips({ parent: document.body }),
        ...languageExtensions,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
      parent: containerRef.current,
    })
    // Mounting alone never grabs actual keyboard focus — without this,
    // activating a block (e.g. clicking "Add block") left focus wherever
    // it already was (the button just clicked), so typing immediately
    // went nowhere until the editor was clicked into a second time.
    view.focus()

    return () => view.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately mount-once; see this component's own top comment on the key-forces-remount contract callers must uphold
  }, [])

  return (
    <div
      ref={containerRef}
      className={bare ? 'cm-editor-wrapper overflow-hidden' : 'cm-editor-wrapper overflow-hidden rounded-md border'}
      style={bare ? undefined : { borderColor: 'var(--border)' }}
    />
  )
}
