import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, FolderOpen, FileText, Clock } from 'lucide-react'
import { useVaultStore, computeVaultStats } from '../stores/vault.store'
import type { VaultStats } from '../stores/vault.store'
import { useNoteStore } from '../stores/note.store'
import { useUIStore } from '../stores/ui.store'
import { useToastStore } from '../stores/toast.store'
import * as driveService from '../services/drive.service'
import { toUserMessage, logError } from '../lib/error-messages'
import { Header } from '../components/layout/Header'
import { GlobalSearchModal } from '../components/search/GlobalSearchModal'
import { PromptModal } from '../components/common/PromptModal'
import { ConfirmModal } from '../components/common/ConfirmModal'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import { useKeyboardShortcut } from '../hooks/useKeyboard'

// The "powerful platform" home for vault management — create/open/rename/
// delete all live here rather than being squeezed into the sidebar's small
// anchored dropdown (which only offers a quick switch + a link back here).
export function VaultManagerRoute() {
  const vaults = useVaultStore((s) => s.vaults)
  const isLoading = useVaultStore((s) => s.isLoading)
  const error = useVaultStore((s) => s.error)
  const loadVault = useVaultStore((s) => s.loadVault)
  const switchVault = useVaultStore((s) => s.switchVault)
  const createVault = useVaultStore((s) => s.createVault)
  const renameVault = useVaultStore((s) => s.renameVault)
  const deleteVault = useVaultStore((s) => s.deleteVault)
  const resetNote = useNoteStore((s) => s.reset)
  const showToast = useToastStore((s) => s.show)
  const navigate = useNavigate()
  const hasStarted = useRef(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [stats, setStats] = useState<Map<string, VaultStats>>(new Map())
  const [searchOpen, setSearchOpen] = useState(false)

  useKeyboardShortcut('f', () => setSearchOpen(true), { ctrl: true, shift: true })

  // Same one-shot-per-mount pattern as useFileTree — this route needs the
  // vaults list populated (and the flat-vault migration run) even though
  // nothing here needs the active vault's own file tree.
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true
      loadVault()
    }
  }, [loadVault])

  // Landing here (e.g. via the navbar's "Sanctum" wordmark) from a note
  // that was still open leaves note.store's activeNoteId pointing at
  // something no longer being viewed — Header reads that directly, so
  // without this it would keep showing Saved/Unsaved + History/Export for
  // a note that isn't open on this page at all. Same reset VaultRoute
  // already does for its own "no fileId" case.
  useEffect(() => {
    resetNote()
  }, [resetNote])

  // A quick per-vault summary (note count, last edited) without switching
  // into each one — reuses the same single whole-Drive listing every vault
  // load already does, just sliced per vault client-side. Best-effort: a
  // failure here just leaves cards without stats, not worth a toast for.
  useEffect(() => {
    if (vaults.length === 0) {
      setStats(new Map())
      return
    }
    let cancelled = false
    driveService
      .listAllFiles()
      .then((files) => {
        if (cancelled) return
        setStats(new Map(vaults.map((v) => [v.id, computeVaultStats(files, v.id)])))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [vaults])

  async function handleOpen(id: string) {
    try {
      await switchVault(id)
      // sidebarOpen is plain in-memory UI state, not reset by navigation —
      // if it was left closed from an earlier session action, landing in a
      // freshly-opened vault with no visible way to reach its notes/folders
      // was confusing. Entering a vault should always make it visible.
      useUIStore.getState().openSidebar()
      navigate('/vault')
    } catch (err) {
      logError('vaultManager.open', err)
      showToast(toUserMessage(err, 'Could not open that vault.'), 'error')
    }
  }

  async function handleCreate(name: string) {
    setCreateOpen(false)
    try {
      await createVault(name)
      showToast(`Created vault "${name}"`, 'success')
      useUIStore.getState().openSidebar()
      navigate('/vault')
    } catch (err) {
      logError('vaultManager.create', err)
      showToast(toUserMessage(err, 'Could not create the vault.'), 'error')
    }
  }

  async function handleRename(name: string) {
    if (!renameTarget) return
    const { id } = renameTarget
    setRenameTarget(null)
    try {
      await renameVault(id, name)
      showToast(`Renamed to "${name}"`, 'success')
    } catch (err) {
      logError('vaultManager.rename', err)
      showToast(toUserMessage(err, 'Could not rename that vault.'), 'error')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { id, name } = deleteTarget
    try {
      await deleteVault(id)
      showToast(`Deleted "${name}"`, 'success')
    } catch (err) {
      logError('vaultManager.delete', err)
      showToast(toUserMessage(err, `Could not delete "${name}".`), 'error')
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Same navbar as inside a vault — consistent branding/theme/sign-out
          regardless of which "page" of the app you're on, and the wordmark
          click (navigate to /vaults) makes sense as a real "home" action
          now that this page shows it too. Search here queries every vault
          at once (GlobalSearchModal) rather than SearchModal's single
          active-vault scope, since there's no one vault to scope to here. */}
      <Header onOpenSearch={() => setSearchOpen(true)} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-10 sm:py-16">
        <div className="mb-2">
          <h1 className="text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--accent-heading)' }}>
            Your vaults
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Each vault is a fully separate set of notes — pick one to open, or create a new one for a new project.
          </p>
        </div>

        {isLoading && vaults.length === 0 && <LoadingSpinner label="Loading vaults…" size={20} />}
        {error && <p style={{ color: 'var(--error)' }}>{error}</p>}

        {!isLoading && !error && vaults.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No vaults yet — create your first one below.
          </p>
        )}

      <div className="flex flex-col gap-2">
        {vaults.map((vault) => (
          <div
            key={vault.id}
            className="flex items-center justify-between gap-2 rounded-lg border px-4 py-3"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:opacity-80"
              onClick={() => handleOpen(vault.id)}
            >
              <FolderOpen size={18} style={{ color: 'var(--accent-link)' }} />
              <div className="min-w-0 flex-1">
                <span className="block truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                  {vault.name}
                </span>
                {/* Fixed-height row regardless of whether stats have
                    arrived yet — a skeleton placeholder holds the same
                    space a real stats line would, so the list doesn't
                    visibly push its content down the moment the async
                    stats fetch resolves after the vault list itself. */}
                <span className="mt-0.5 flex h-4 items-center gap-x-3">
                  {stats.has(vault.id) ? (
                    <span
                      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <FileText size={11} />
                        {stats.get(vault.id)!.noteCount} {stats.get(vault.id)!.noteCount === 1 ? 'note' : 'notes'}
                      </span>
                      {stats.get(vault.id)!.lastModified && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} />
                          Edited {new Date(stats.get(vault.id)!.lastModified!).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span
                      className="h-3 w-32 animate-pulse rounded"
                      style={{ background: 'var(--bg-tertiary)' }}
                      aria-hidden="true"
                    />
                  )}
                </span>
              </div>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={`Rename ${vault.name}`}
                title="Rename vault"
                className="rounded p-1.5 hover:opacity-80"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => setRenameTarget({ id: vault.id, name: vault.name })}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${vault.name}`}
                title="Delete vault"
                className="rounded p-1.5 hover:text-[var(--error)]"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => setDeleteTarget({ id: vault.id, name: vault.name })}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm font-medium hover:opacity-80"
          style={{ borderColor: 'var(--border)', color: 'var(--accent-link)' }}
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={16} />
          New vault
        </button>
      </div>

      <PromptModal
        isOpen={createOpen}
        title="New vault"
        placeholder="Vault name"
        submitLabel="Create"
        onSubmit={handleCreate}
        onClose={() => setCreateOpen(false)}
      />
      <PromptModal
        isOpen={renameTarget !== null}
        title="Rename vault"
        placeholder="Vault name"
        initialValue={renameTarget?.name ?? ''}
        submitLabel="Rename"
        onSubmit={handleRename}
        onClose={() => setRenameTarget(null)}
      />
      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Delete vault"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}" and everything inside it? This moves it to Google Drive's Trash, where it can be recovered.`
            : ''
        }
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
