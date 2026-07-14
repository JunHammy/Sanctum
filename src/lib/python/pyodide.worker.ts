// Runs entirely in a Web Worker, never the main thread — Pyodide's own
// docs are explicit that this needs a *module* worker (a classic worker
// can't load pyodide.asm.mjs, since it's an ES module), and running Python
// on the main thread would freeze Sanctum's whole UI for anything slow or
// an accidental infinite loop. See python-kernel.store.ts for how this
// gets instantiated (`new Worker(new URL(...), { type: 'module' })`).
import { loadPyodide, type PyodideInterface } from 'pyodide'
import type { WorkerRequest, WorkerResponse } from '../code-worker-protocol'

function post(message: WorkerResponse) {
  self.postMessage(message)
}

// Maps an import name detected in a run's code to the Pyodide package name
// to load — a 1:1 mapping for the three packages this app supports (see
// PACKAGE_IMPORT_PATTERNS below), kept as its own table in case a package
// name and its import name ever diverge (not the case for any of these
// three today, but no reason to assume it always won't be).
const SUPPORTED_PACKAGES: Record<string, string> = {
  numpy: 'numpy',
  pandas: 'pandas',
  matplotlib: 'matplotlib',
}

// Deliberately simple string scanning, not a real Python import parser —
// good enough to catch the overwhelmingly common `import x` / `from x
// import y` forms without needing to actually execute anything first to
// find out what it needs.
function detectPackages(code: string): string[] {
  const found: string[] = []
  for (const name of Object.keys(SUPPORTED_PACKAGES)) {
    const pattern = new RegExp(`^\\s*(?:import|from)\\s+${name}\\b`, 'm')
    if (pattern.test(code)) found.push(name)
  }
  return found
}

// matplotlib figures are captured via a manual base64-encode epilogue
// (io.BytesIO + fig.savefig), not matplotlib-pyodide's own default
// "append to document.pyodideMplTarget" behavior — confirmed via research
// this is *necessary*, not just cleaner: a Web Worker has no `document` at
// all, so the default DOM-append behavior can't work here regardless.
// Agg is matplotlib's standard headless/non-interactive backend — set once,
// immediately after the package loads, before any user code (including the
// user's own `import matplotlib.pyplot`) can run, since the backend has to
// be selected before pyplot is first imported to take effect.
const MATPLOTLIB_SETUP = `
import matplotlib
matplotlib.use('Agg')
`

const CAPTURE_FIGURES_EPILOGUE = `
def __sanctum_capture_figures():
    import base64, io
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        return []
    images = []
    for num in plt.get_fignums():
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        images.append(base64.b64encode(buf.read()).decode('utf-8'))
    plt.close('all')
    return images
__sanctum_capture_figures()
`

let pyodide: PyodideInterface | null = null
const loadedPackages = new Set<string>()
// Which run (by execId) each stdout/stderr callback should currently be
// attributed to — Pyodide's stdout/stderr callbacks are registered once at
// load time, not per-run, so this closure-captured variable is what routes
// a given line of output back to the run that's actually producing it.
let currentExecId = -1

async function init() {
  try {
    pyodide = await loadPyodide({
      // Absolute URL, not relative — this runs inside a module worker,
      // where relative-URL resolution rules are less predictable than on
      // the main thread. import.meta.env.BASE_URL is Vite's own configured
      // base path (see vite.config.ts's BASE constant), so this correctly
      // resolves to the self-hosted assets viteStaticCopy placed at
      // dist/pyodide/ regardless of whether the app is served from the
      // domain root (dev) or under /Sanctum/ (production).
      indexURL: `${self.location.origin}${import.meta.env.BASE_URL}pyodide/`,
      stdout: (text) => post({ type: 'stdout', execId: currentExecId, text }),
      stderr: (text) => post({ type: 'stderr', execId: currentExecId, text }),
    })
    post({ type: 'ready' })
  } catch (err) {
    post({ type: 'init-error', message: err instanceof Error ? err.message : String(err) })
  }
}

async function run(execId: number, code: string) {
  if (!pyodide) return
  currentExecId = execId

  const needed = detectPackages(code).filter((name) => !loadedPackages.has(name))
  for (const name of needed) {
    post({ type: 'loading-package', execId, packageName: SUPPORTED_PACKAGES[name] })
    await pyodide.loadPackage(SUPPORTED_PACKAGES[name])
    loadedPackages.add(name)
    if (name === 'matplotlib') await pyodide.runPythonAsync(MATPLOTLIB_SETUP)
  }

  try {
    await pyodide.runPythonAsync(code)
    let images: string[] = []
    if (loadedPackages.has('matplotlib')) {
      const result = await pyodide.runPythonAsync(CAPTURE_FIGURES_EPILOGUE)
      images = result?.toJs ? result.toJs() : []
      result?.destroy?.()
    }
    post({ type: 'result', execId, images })
  } catch (err) {
    post({ type: 'error', execId, message: err instanceof Error ? err.message : String(err) })
  }
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'run') run(msg.execId, msg.code)
  // 'restart' isn't handled here — python-kernel.store.ts implements
  // restart by terminating this whole worker and creating a fresh one,
  // not by trying to reset Pyodide's internal interpreter state in place
  // (Pyodide has no supported API for that within a single instance).
}

init()
