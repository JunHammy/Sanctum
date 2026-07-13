import { useEffect, useRef } from 'react'
import { Play, RotateCcw, Loader2 } from 'lucide-react'
import { usePythonKernelStore, type PythonBlockOutput } from '../../stores/python-kernel.store'
import type { PersistedPythonOutput } from '../../lib/python/python-syntax'

interface PythonCodeBlockProps {
  noteId: string
  blockKey: string
  code: string
  // The block's last-saved result, parsed straight from its own rawText
  // (python-syntax.ts's parsePersistedOutput) — shown immediately on mount,
  // before anything has been (re-)run this session, so a note doesn't come
  // up blank just because its Pyodide kernel hasn't started yet.
  initialOutput?: PersistedPythonOutput | null
  // Fired the moment a *live* run (this session) finishes — never from
  // initialOutput alone. The caller is responsible for actually writing it
  // back into the note (Block.tsx via its per-block onChange in Edit mode,
  // MarkdownReader via a direct rawBody line-splice in Read mode — this
  // component doesn't need to know which).
  onPersist?: (output: PersistedPythonOutput) => void
}

// Rendered as a plain React sibling right next to a ```python block's own
// (unmodified, still highlight.js-rendered) code — both Block.tsx and
// MarkdownReader mount this directly rather than portaling it into the
// rendered HTML the way an earlier version of this app did. That portal
// approach (into a `.python-run-controls` placeholder plugin-python.ts still
// emits, now otherwise unused, living inside the same dangerouslySetInnerHTML
// subtree as the code around it) turned out to cause a genuine infinite
// loop in two separate, confirmed-via-testing scenarios: once the portal's
// own state changed, the whole subtree got silently torn down and rebuilt
// on every render, even when the replacement HTML was byte-identical each
// time. See split-python-segments.ts for how MarkdownReader avoids it now
// (splitting its already-rendered HTML around each python block instead of
// portaling into it) and Block.tsx's own `parsedPython`/`parsedOutput` for
// the equivalent, simpler fix there (it already has a real per-block React
// object to render this into directly).
//
// Reads everything from python-kernel.store.ts rather than owning any
// local state itself — the kernel (and therefore a block's own output)
// has to survive this component unmounting/remounting (e.g. Block.tsx
// swapping active/inactive, or Read/Edit toggling), since the whole point
// of the shared-kernel model is that switching away from a note and back
// doesn't lose accumulated Python state.
export function PythonCodeBlock({ noteId, blockKey, code, initialOutput, onPersist }: PythonCodeBlockProps) {
  const kernelStatus = usePythonKernelStore((s) => s.kernels[noteId]?.status)
  const initError = usePythonKernelStore((s) => s.kernels[noteId]?.initError)
  const liveOutput = usePythonKernelStore((s) => s.kernels[noteId]?.outputs[blockKey])

  // This session's live run always wins over whatever was last persisted —
  // initialOutput is only ever the starting point shown before the first
  // run (or re-run) this session actually happens.
  const output: PythonBlockOutput | undefined =
    liveOutput ??
    (initialOutput
      ? {
          status: initialOutput.errorMessage ? 'error' : 'success',
          execNumber: initialOutput.execNumber,
          stdout: initialOutput.stdout,
          stderr: initialOutput.stderr,
          images: initialOutput.images,
          errorMessage: initialOutput.errorMessage,
          loadingPackage: null,
        }
      : undefined)

  const isRunning = output?.status === 'running' || output?.status === 'loading-package'
  const isLoadingRuntime = isRunning && kernelStatus === 'loading-runtime'

  // Starting a new run clears stdout/stderr/images to blank *immediately*
  // (python-kernel.store's dispatchRun) — correct, so a fresh run's output
  // never gets mixed with the previous one's, but taken at face value it
  // means the panel below goes empty the instant Run is clicked and stays
  // that way until the first real output streams in a moment later.
  // Confirmed as a real, if brief, glitch from testing (output visibly
  // disappears then reappears on every Run click). Keeping the last
  // non-empty output around in a ref and falling back to it — still with
  // the *current* status/execNumber, so the Run button/spinner reflect
  // reality — while a run has started but hasn't produced anything new yet
  // smooths this over: the old result just sits there (dimmed, see below)
  // until the new one actually replaces it.
  const hasContent = !!output && (output.stdout !== '' || output.stderr !== '' || output.errorMessage !== null || output.images.length > 0)
  const lastShownOutputRef = useRef<PythonBlockOutput | null>(null)
  if (hasContent && output) lastShownOutputRef.current = output
  const displayOutput: PythonBlockOutput | undefined =
    isRunning && !hasContent && lastShownOutputRef.current
      ? { ...lastShownOutputRef.current, status: output!.status, execNumber: output!.execNumber, loadingPackage: output!.loadingPackage }
      : output

  // Persists the instant a live run reaches a terminal state — keyed on
  // status/execNumber (not the whole output object) so this only fires once
  // per actual completion, not once per streaming stdout chunk along the
  // way. Guarded against re-persisting identical content: Block.tsx mounts
  // a fresh PythonCodeBlock instance every time a block toggles active/
  // inactive, so without this guard, merely toggling a block — with no new
  // run at all — would still fire onPersist (and therefore an autosave)
  // every single time, since liveOutput's already-settled status still
  // counts as "changed" on this component's very first render.
  useEffect(() => {
    if (!liveOutput || !onPersist) return
    if (liveOutput.status !== 'success' && liveOutput.status !== 'error') return
    const next: PersistedPythonOutput = {
      execNumber: liveOutput.execNumber ?? 0,
      stdout: liveOutput.stdout,
      stderr: liveOutput.stderr,
      images: liveOutput.images,
      errorMessage: liveOutput.errorMessage,
    }
    if (initialOutput && JSON.stringify(initialOutput) === JSON.stringify(next)) return
    onPersist(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveOutput?.status, liveOutput?.execNumber])

  function handleRun() {
    usePythonKernelStore.getState().runBlock(noteId, blockKey, code)
  }

  function handleRestart() {
    usePythonKernelStore.getState().restartKernel(noteId)
  }

  return (
    // No border/rounding of its own — every caller (Block.tsx's active and
    // inactive rendering, MarkdownReader's per-segment rendering) places
    // this directly below a code area inside one shared `overflow-hidden
    // rounded-md border` container, so this only needs a top divider line
    // to read as
    // "the output half of one cell" rather than a second, separate box.
    //
    // stopPropagation on the whole panel, not just individual buttons: in
    // Block.tsx's inactive rendering, a sibling element in this same
    // wrapper handles "click anywhere to activate" — without this, clicking
    // Run/Restart, or anywhere in the output text, would bubble up and
    // immediately flip the block into raw-text edit mode on the same click,
    // undoing whatever Run/Restart just did.
    <div className="border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 border-b px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'var(--accent-link)', color: 'var(--bg-primary)' }}
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {isLoadingRuntime ? 'Starting Python…' : output?.status === 'loading-package' ? `Loading ${output.loadingPackage}…` : 'Run'}
        </button>
        <button
          type="button"
          onClick={handleRestart}
          title="Restart kernel — clears all Python state for this note"
          className="flex items-center gap-1 rounded p-1 hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <RotateCcw size={12} />
        </button>
        {output?.execNumber != null && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            [{output.execNumber}]
          </span>
        )}
        {isLoadingRuntime && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            First run starts the Python runtime (~5–10s, one-time per note)
          </span>
        )}
      </div>

      {initError && (
        <p className="px-3 py-2 text-xs" style={{ color: 'var(--error)' }}>
          Couldn't start the Python runtime: {initError}
        </p>
      )}

      {displayOutput && (displayOutput.stdout || displayOutput.stderr || displayOutput.errorMessage || displayOutput.images.length > 0) && (
        // Dimmed specifically while showing a *stale* result (a run is in
        // progress but hasn't produced anything new yet) — a visual cue
        // that this is about to be replaced, without going all the way to
        // the jarring blank-then-reappear this replaced.
        <div className="px-3 py-2 transition-opacity" style={{ opacity: isRunning && !hasContent ? 0.5 : 1 }}>
          {displayOutput.stdout && (
            <pre className="whitespace-pre-wrap text-xs" style={{ color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
              {displayOutput.stdout}
            </pre>
          )}
          {displayOutput.stderr && (
            <pre
              className="mt-1 whitespace-pre-wrap text-xs"
              style={{ color: 'var(--warning)', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
            >
              {displayOutput.stderr}
            </pre>
          )}
          {displayOutput.errorMessage && (
            <pre
              className="mt-1 whitespace-pre-wrap text-xs"
              style={{ color: 'var(--error)', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
            >
              {displayOutput.errorMessage}
            </pre>
          )}
          {displayOutput.images.map((base64, i) => (
            <img key={i} src={`data:image/png;base64,${base64}`} alt={`Figure ${i + 1}`} className="mt-2 max-w-full rounded" />
          ))}
        </div>
      )}
    </div>
  )
}
