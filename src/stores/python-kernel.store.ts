import { create } from 'zustand'
import type { WorkerRequest, WorkerResponse } from '../lib/python/python-worker-protocol'

export interface PythonBlockOutput {
  status: 'idle' | 'running' | 'loading-package' | 'success' | 'error'
  // The [N] counter shown next to a block's output — assigned when a run
  // starts, incrementing across the whole note (not per-block), same
  // "which order did things actually happen in" convention Jupyter itself
  // uses. Persists (doesn't reset) after the run finishes, so `null` here
  // specifically means "never run this session," not "currently idle."
  execNumber: number | null
  stdout: string
  stderr: string
  images: string[]
  errorMessage: string | null
  loadingPackage: string | null
}

interface NoteKernel {
  worker: Worker
  status: 'loading-runtime' | 'ready' | 'init-error'
  initError: string | null
  nextExecId: number
  nextExecNumber: number
  // Routes an incoming worker message (which only knows its own execId)
  // back to the block that requested it.
  execIdToBlockKey: Map<number, string>
  // A run requested before the worker finished loading Pyodide (the common
  // case for literally the first Run click in a note) waits here and
  // flushes once 'ready' arrives, rather than being dropped.
  pendingRuns: Array<{ blockKey: string; code: string }>
  outputs: Record<string, PythonBlockOutput>
}

interface PythonKernelState {
  kernels: Record<string, NoteKernel>
  runBlock: (noteId: string, blockKey: string, code: string) => void
  // Terminates the note's worker and creates a fresh one — restart means
  // "start over," not "reset in place." Pyodide has no supported API for
  // clearing a single running instance's interpreter state, so a genuinely
  // fresh Worker (and therefore a fresh Python interpreter) is the only
  // reliable way to actually clear accumulated state.
  restartKernel: (noteId: string) => void
  // Called when a note's tab is actually closed (see TabBar.tsx) — frees
  // the worker's memory. Deliberately *not* called on merely navigating
  // away from a note while its tab stays open, so switching back doesn't
  // lose accumulated state.
  closeKernel: (noteId: string) => void
}

const EMPTY_OUTPUT: PythonBlockOutput = {
  status: 'idle',
  execNumber: null,
  stdout: '',
  stderr: '',
  images: [],
  errorMessage: null,
  loadingPackage: null,
}

function createWorker(): Worker {
  return new Worker(new URL('../lib/python/pyodide.worker.ts', import.meta.url), { type: 'module' })
}

function send(worker: Worker, message: WorkerRequest) {
  worker.postMessage(message)
}

export const usePythonKernelStore = create<PythonKernelState>()((set, get) => {
  // Wires a freshly-created worker's onmessage handler — pulled out of
  // runBlock/restartKernel (both create a worker) so the routing logic
  // exists in exactly one place.
  function attachWorker(noteId: string, worker: Worker) {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data

      // Handled outside the main set() below, not as one of its branches —
      // dispatchRun makes its own set() call per pending run, and calling
      // set() from *within* another set()'s updater function would operate
      // on state from before this same update committed. Committing
      // 'ready' first, then flushing pending runs as separate, sequential
      // set() calls afterward, avoids that entirely.
      if (msg.type === 'ready') {
        const pending = get().kernels[noteId]?.pendingRuns ?? []
        set((state) => {
          const kernel = state.kernels[noteId]
          if (!kernel || kernel.worker !== worker) return state
          return { kernels: { ...state.kernels, [noteId]: { ...kernel, status: 'ready', pendingRuns: [] } } }
        })
        for (const { blockKey, code } of pending) dispatchRun(noteId, blockKey, code)
        return
      }

      set((state) => {
        const kernel = state.kernels[noteId]
        if (!kernel || kernel.worker !== worker) return state // stale worker from a since-restarted kernel

        if (msg.type === 'init-error') {
          return { kernels: { ...state.kernels, [noteId]: { ...kernel, status: 'init-error', initError: msg.message } } }
        }

        const blockKey = kernel.execIdToBlockKey.get(msg.execId)
        if (!blockKey) return state
        const current = kernel.outputs[blockKey] ?? EMPTY_OUTPUT
        let next: PythonBlockOutput = current

        if (msg.type === 'loading-package') {
          next = { ...current, status: 'loading-package', loadingPackage: msg.packageName }
        } else if (msg.type === 'stdout') {
          next = { ...current, status: 'running', loadingPackage: null, stdout: current.stdout + msg.text + '\n' }
        } else if (msg.type === 'stderr') {
          next = { ...current, status: 'running', loadingPackage: null, stderr: current.stderr + msg.text + '\n' }
        } else if (msg.type === 'result') {
          next = { ...current, status: 'success', loadingPackage: null, images: msg.images }
        } else if (msg.type === 'error') {
          next = { ...current, status: 'error', loadingPackage: null, errorMessage: msg.message }
        }

        return {
          kernels: {
            ...state.kernels,
            [noteId]: { ...kernel, outputs: { ...kernel.outputs, [blockKey]: next } },
          },
        }
      })
    }
  }

  // Assumes the kernel is already 'ready' — runBlock is what handles the
  // not-ready/needs-queueing case before ever calling this.
  function dispatchRun(noteId: string, blockKey: string, code: string) {
    set((state) => {
      const kernel = state.kernels[noteId]
      if (!kernel) return state
      const execId = kernel.nextExecId
      const execNumber = kernel.nextExecNumber
      kernel.execIdToBlockKey.set(execId, blockKey)
      send(kernel.worker, { type: 'run', execId, code })
      return {
        kernels: {
          ...state.kernels,
          [noteId]: {
            ...kernel,
            nextExecId: execId + 1,
            nextExecNumber: execNumber + 1,
            outputs: {
              ...kernel.outputs,
              [blockKey]: { ...EMPTY_OUTPUT, status: 'running', execNumber },
            },
          },
        },
      }
    })
  }

  return {
    kernels: {},

    runBlock: (noteId, blockKey, code) => {
      const existing = get().kernels[noteId]
      if (!existing) {
        const worker = createWorker()
        attachWorker(noteId, worker)
        set((state) => ({
          kernels: {
            ...state.kernels,
            [noteId]: {
              worker,
              status: 'loading-runtime',
              initError: null,
              nextExecId: 0,
              nextExecNumber: 1,
              execIdToBlockKey: new Map(),
              pendingRuns: [{ blockKey, code }],
              outputs: { [blockKey]: { ...EMPTY_OUTPUT, status: 'running' } },
            },
          },
        }))
        return
      }
      if (existing.status === 'loading-runtime') {
        set((state) => ({
          kernels: {
            ...state.kernels,
            [noteId]: {
              ...existing,
              pendingRuns: [...existing.pendingRuns, { blockKey, code }],
              outputs: { ...existing.outputs, [blockKey]: { ...EMPTY_OUTPUT, status: 'running' } },
            },
          },
        }))
        return
      }
      if (existing.status === 'init-error') return // nothing sensible to run against a kernel that never started
      dispatchRun(noteId, blockKey, code)
    },

    restartKernel: (noteId) => {
      const existing = get().kernels[noteId]
      existing?.worker.terminate()
      const worker = createWorker()
      attachWorker(noteId, worker)
      set((state) => ({
        kernels: {
          ...state.kernels,
          [noteId]: {
            worker,
            status: 'loading-runtime',
            initError: null,
            nextExecId: 0,
            nextExecNumber: 1,
            execIdToBlockKey: new Map(),
            pendingRuns: [],
            outputs: {},
          },
        },
      }))
    },

    closeKernel: (noteId) => {
      const existing = get().kernels[noteId]
      if (!existing) return
      existing.worker.terminate()
      set((state) => {
        const { [noteId]: _removed, ...rest } = state.kernels
        return { kernels: rest }
      })
    },
  }
})
