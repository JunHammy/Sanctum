// Runs entirely in a Web Worker, never the main thread — same reasoning as
// pyodide.worker.ts (an accidental infinite loop or a slow computation
// shouldn't freeze Sanctum's UI). Unlike Pyodide, there's no runtime to
// download — JS execution is native to the Worker's own JS engine — so
// this posts 'ready' immediately, no async init step at all.
import type { WorkerRequest, WorkerResponse } from '../code-worker-protocol'

function post(message: WorkerResponse) {
  self.postMessage(message)
}

// Formats a console.log/warn/error argument as text — a rough approximation
// of the browser devtools' own object inspector, not a full one. Strings
// pass through as-is (JSON.stringify would wrap them in quotes, which
// isn't what a plain `console.log("hello")` should show); everything else
// goes through JSON.stringify for a readable multi-line shape, falling
// back to String() for values JSON.stringify can't handle (functions,
// symbols, circular references).
function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg === undefined) return 'undefined'
  if (arg instanceof Error) return arg.stack ?? arg.message
  try {
    const json = JSON.stringify(arg, null, 2)
    return json ?? String(arg)
  } catch {
    return String(arg)
  }
}

// Which run (by execId) console output should currently be attributed to —
// same "closure-captured current id, callbacks registered once" approach
// pyodide.worker.ts uses for its stdout/stderr callbacks, just applied to
// console overrides instead of a runtime-provided stdout hook (JS has no
// such hook — console interception is the only way to capture output at
// all).
function captureConsole(execId: number): () => void {
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error }
  const toStdout = (...args: unknown[]) => post({ type: 'stdout', execId, text: args.map(formatArg).join(' ') })
  const toStderr = (...args: unknown[]) => post({ type: 'stderr', execId, text: args.map(formatArg).join(' ') })
  console.log = toStdout
  console.info = toStdout
  console.warn = toStderr
  console.error = toStderr
  return () => Object.assign(console, original)
}

// Each run gets its own fresh scope (an async IIFE via indirect eval, so
// top-level `await` works) rather than persisting variables across runs
// the way Pyodide's single reused interpreter naturally does for Python —
// a deliberate simplification, not an oversight. Genuine cross-run
// persistence would mean rewriting each run's top-level declarations into
// assignments on a shared object, real complexity not justified for a
// first pass; a fresh scope per run is also simply what's needed for clean
// async/await support in the first place.
async function run(execId: number, code: string) {
  const restoreConsole = captureConsole(execId)
  try {
    // Indirect eval (the `(0, eval)` trick) runs in global scope rather
    // than this function's own lexical scope — irrelevant here since the
    // async-IIFE wrapper already scopes every declaration to itself
    // regardless, but keeps this worker's own top-level bindings
    // (post/formatArg/captureConsole/run) from ever being shadowed or
    // clobbered by a name the user's code happens to declare.
    const indirectEval = eval
    await indirectEval(`(async () => {\n${code}\n})()`)
    post({ type: 'result', execId, images: [] })
  } catch (err) {
    post({ type: 'error', execId, message: err instanceof Error ? (err.stack ?? err.message) : String(err) })
  } finally {
    restoreConsole()
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'run') run(msg.execId, msg.code)
  // 'restart' isn't handled here — same as pyodide.worker.ts, js-kernel.
  // store.ts implements restart by terminating this whole worker and
  // creating a fresh one.
}

post({ type: 'ready' })
