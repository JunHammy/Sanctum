import { useEffect, useRef } from 'react'
import { parseMathBlock, serializeMathBlock, stripMathDelimiters } from '../../lib/math-syntax'
import type { MathfieldElement } from 'mathlive'

interface MathBlockEditorProps {
  id: string
  value: string
  onChange: (id: string, rawText: string) => void
  // True (default) for the small inline instance living in the note flow —
  // strips MathLive's own built-in menu/keyboard-toggle icons entirely and
  // never opens its virtual keyboard. Confirmed real UX problem from
  // testing: those icons floated directly over the typing area, and the
  // virtual keyboard is a viewport-docked panel that has no idea where an
  // inline block sits on a long, scrolled note — if the block happened to
  // be in the lower half of the visible viewport, the keyboard just
  // covered it, with no way to see what was being typed. False only for
  // the copy rendered inside Block.tsx's fullscreen expand Modal, where
  // there's reliably enough room for MathLive's own keyboard-toggle UI to
  // not cover the field, so it's left fully intact there instead of
  // rebuilding that (focus-preserving) logic ourselves.
  compact?: boolean
}

// Same props shape as TableGridEditor (`{ id, value, onChange }`) so
// Block.tsx's render branch is a drop-in swap — value is the block's full
// rawText ($$...$$ included), parsed here the same way TableGridEditor
// parses its own value.
//
// Mounted imperatively via a plain <div> + ref, not a JSX <math-field> tag
// — mathlive is dynamically imported (see below) to keep its ~700KB out of
// the main bundle, same lazy-loading convention as useCharts.ts's Mermaid/
// Chart.js/Plotly. That means the custom element isn't guaranteed to be
// registered yet at the moment this component's JSX would first render a
// <math-field> tag in the DOM — creating it only *after* the import
// resolves guarantees `.value` and event wiring act on a fully-upgraded
// element, not a timing-dependent guess. It also sidesteps needing a global
// JSX IntrinsicElements type augmentation for a tag used in exactly one
// place in the whole app.
//
// Uncontrolled and mounted once, same rationale as MarkdownEditor/
// TableGridEditor: the initial LaTeX is read once on mount and never
// re-synced from a later `value` prop change, since nothing external
// mutates an active block's rawText except this component's own onChange
// calls — re-syncing would fight in-progress typing.
export function MathBlockEditor({ id, value, onChange, compact = true }: MathBlockEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const initialLatex = parseMathBlock(value) ?? ''
    let cancelled = false
    let mathField: MathfieldElement | null = null

    import('mathlive').then(() => {
      if (cancelled || !containerRef.current) return
      mathField = document.createElement('math-field') as MathfieldElement
      mathField.value = initialLatex
      // 'manual' — never auto-opens the virtual keyboard on focus. Set
      // regardless of `compact`: even in the expanded view, the keyboard
      // should only appear when explicitly requested via MathLive's own
      // toggle button, not the instant the field gains focus.
      mathField.mathVirtualKeyboardPolicy = 'manual'
      if (compact) mathField.classList.add('math-field-compact')
      containerRef.current.appendChild(mathField)
      mathField.addEventListener('input', () => {
        // 'latex-without-placeholders', not the plain `.value` getter —
        // confirmed real bug from testing: an unfilled template slot (e.g.
        // typing \frac and pressing Enter, then never typing into the
        // numerator/denominator) serializes via plain .value as a literal
        // \placeholder{} command, which is MathLive-internal — KaTeX (the
        // separate renderer Read mode and every other block use) has never
        // heard of it, and renders it as a bright red "unrecognized
        // command" rather than an empty slot. This output format strips
        // those markers instead of leaving them for a different renderer
        // to choke on.
        onChangeRef.current(id, serializeMathBlock(mathField!.getValue('latex-without-placeholders')))
      })
      // Capture phase — 'paste' needs to be intercepted before MathLive's
      // own internal handling (inside its shadow DOM) processes it, so
      // stripMathDelimiters can run first. Only overrides the default
      // behavior when a delimiter pair was actually found and removed —
      // plain LaTeX (the common case) falls through to MathLive's own
      // paste handling untouched.
      mathField.addEventListener(
        'paste',
        (e: ClipboardEvent) => {
          const text = e.clipboardData?.getData('text/plain')
          if (!text) return
          const stripped = stripMathDelimiters(text)
          if (stripped === text) return
          e.preventDefault()
          e.stopPropagation()
          mathField!.insert(stripped)
        },
        true,
      )
      mathField.focus()
    })

    return () => {
      cancelled = true
      mathField?.remove()
    }
    // Mount once — see the component-level comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      // pt-10 reserves space for Block.tsx's raw/visual toggle button
      // (absolute top-2 right-2), same convention as TableGridEditor's
      // own wrapper — without it, the button would sit on top of the
      // math field instead of above it.
      className="rounded-md border p-3 pt-10"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
    />
  )
}
