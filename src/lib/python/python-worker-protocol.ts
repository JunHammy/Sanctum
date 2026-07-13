// Message shapes shared between the main thread (python-kernel.store.ts)
// and pyodide.worker.ts — kept in their own file (not colocated in the
// worker itself) so the main-thread side can import the types without
// pulling any worker-only code into the main bundle.

export interface RunRequest {
  type: 'run'
  execId: number
  code: string
}

export interface RestartRequest {
  type: 'restart'
}

export type WorkerRequest = RunRequest | RestartRequest

export interface ReadyMessage {
  type: 'ready'
}

export interface InitErrorMessage {
  type: 'init-error'
  message: string
}

// Fired once per package actually loaded (not for ones already cached from
// an earlier run this session) — lets the UI show "Loading numpy…" instead
// of a plain, undifferentiated spinner for what can be a genuinely
// multi-second step on top of Pyodide's own already-large first load.
export interface LoadingPackageMessage {
  type: 'loading-package'
  execId: number
  packageName: string
}

// Streamed as it's produced, not buffered until the run finishes — a
// long-running print loop should show output as it happens.
export interface StdoutMessage {
  type: 'stdout'
  execId: number
  text: string
}

export interface StderrMessage {
  type: 'stderr'
  execId: number
  text: string
}

export interface ResultMessage {
  type: 'result'
  execId: number
  // base64 PNG data URLs — see pyodide.worker.ts's matplotlib capture
  // epilogue for why these come back as a batch after the run finishes,
  // not streamed incrementally like stdout.
  images: string[]
}

export interface ErrorMessage {
  type: 'error'
  execId: number
  message: string
}

export type WorkerResponse =
  | ReadyMessage
  | InitErrorMessage
  | LoadingPackageMessage
  | StdoutMessage
  | StderrMessage
  | ResultMessage
  | ErrorMessage
