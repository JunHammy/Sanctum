import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, FolderOpen, FileText, Star } from 'lucide-react'
import { useVaultStore, computeVaultStats, computeStarredFiles, type StarredFile } from '../stores/vault.store'
import type { VaultStats } from '../stores/vault.store'
import { useNoteStore } from '../stores/note.store'
import { useUIStore } from '../stores/ui.store'
import { useToastStore } from '../stores/toast.store'
import { useNetworkStore } from '../stores/network.store'
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
  const isOnline = useNetworkStore((s) => s.isOnline)
  const navigate = useNavigate()
  const hasStarted = useRef(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [stats, setStats] = useState<Map<string, VaultStats>>(new Map())
  const [starredFiles, setStarredFiles] = useState<StarredFile[]>([])
  const [unstarTarget, setUnstarTarget] = useState<StarredFile | null>(null)
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

  // globals.css locks html/body to the viewport height with overflow:
  // hidden app-wide, since every AppShell-based route (every note view)
  // relies on that to keep its own inner content-pane scroll from also
  // flickering a second, redundant window-level scrollbar. This route
  // doesn't go through AppShell at all, so it opts back into ordinary page
  // scroll for just as long as it's mounted, then hands the lock back.
  useEffect(() => {
    document.body.classList.add('allow-page-scroll')
    return () => document.body.classList.remove('allow-page-scroll')
  }, [])

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
  // into each one, plus the cross-vault Starred list — both slice the exact
  // same single whole-Drive listing client-side, so starring costs no extra
  // API call beyond what the stats fetch already made. Best-effort: a
  // failure here just leaves cards without stats/an empty Starred section,
  // not worth a toast for.
  const refreshStats = useCallback(() => {
    if (vaults.length === 0) {
      setStats(new Map())
      setStarredFiles([])
      return () => {}
    }
    let cancelled = false
    driveService
      .listAllFiles()
      .then((files) => {
        if (cancelled) return
        setStats(new Map(vaults.map((v) => [v.id, computeVaultStats(files, v.id)])))
        setStarredFiles(computeStarredFiles(files, vaults))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [vaults])

  useEffect(() => refreshStats(), [refreshStats])

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

  // A starred item lives in a vault that isn't necessarily the active one —
  // switch into it first (same sequence handleOpen already uses), then land
  // directly on the note/PDF itself rather than just the vault root.
  async function openStarred(item: StarredFile) {
    try {
      await switchVault(item.vaultId)
      useUIStore.getState().openSidebar()
      navigate(item.mimeType === 'application/pdf' ? `/vault/pdf/${item.id}` : `/vault/note/${item.id}`)
    } catch (err) {
      logError('vaultManager.openStarred', err)
      showToast(toUserMessage(err, 'Could not open that vault.'), 'error')
    }
  }

  // Deliberately bypasses vault.store's toggleStarred (which optimistically
  // updates the *active* vault's fileTree) — a starred item here usually
  // belongs to a vault that isn't loaded at all right now, and switching
  // into it just to flip one flag would be a confusing side effect of
  // clicking "unstar" on this page. Talks to Drive directly instead, with
  // this component's own local optimistic removal. Confirmed first (unlike
  // the sidebar's own direct single-click toggle) — the star icon sits
  // right next to this row's main click target here, so an accidental
  // misclick is a real risk in a way it isn't in the sidebar.
  async function handleUnstar() {
    if (!unstarTarget) return
    const item = unstarTarget
    setUnstarTarget(null)
    setStarredFiles((prev) => prev.filter((f) => f.id !== item.id))
    try {
      await driveService.setFileStarred(item.id, false)
    } catch (err) {
      logError('vaultManager.unstar', err)
      showToast(toUserMessage(err, 'Could not unstar that item.'), 'error')
      refreshStats() // resync from Drive rather than guessing where to re-insert it
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
    // min-h-screen, not h-screen + overflow-hidden — this route renders its
    // own Header directly rather than going through AppShell, so unlike
    // every note view (AppShell/ContentPane's fixed-shell-plus-inner-scroll
    // pattern), there's no Sidebar to keep independently scrollable here.
    // Letting the actual page scroll natively means the scrollbar sits at
    // the real browser-window edge, not indented to this content column's
    // own edge — confirmed via testing that the inner-scroll version read
    // as broken/unusual specifically because of that indent.
    <div className="flex min-h-screen flex-col">
      {/* Same navbar as inside a vault — consistent branding/theme/sign-out
          regardless of which "page" of the app you're on, and the wordmark
          click (navigate to /vaults) makes sense as a real "home" action
          now that this page shows it too. Search here queries every vault
          at once (GlobalSearchModal) rather than SearchModal's single
          active-vault scope, since there's no one vault to scope to here.
          sticky, not fixed — with native page scroll (see the effect
          above), sticky is what keeps it pinned to the top through
          ordinary document flow instead of needing a manual scroll-offset
          spacer the way `position: fixed` would. */}
      <div className="sticky top-0 z-10">
        <Header onOpenSearch={() => setSearchOpen(true)} />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:py-16">
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

        {/* No internal height cap — just stacks and lets the whole page
            scroll, same as Starred below it. A capped-height scroll region
            here read as broken in practice (cards visibly clipped to a
            sliver), and isn't worth the complexity until vault count
            actually becomes a real problem. justify-center is what centers
            an incomplete last row — a CSS grid's fixed column tracks don't
            do that on their own without extra tricks, flex-wrap does it for
            free. Card width isn't pinned to a fixed column count (e.g.
            exactly 5/row) — it just wraps naturally at whatever the
            container's width allows. */}
        <div className="flex flex-wrap justify-center gap-3 py-1">
          {vaults.map((vault) => (
            <div
              key={vault.id}
              className="group relative flex w-40 flex-col items-center gap-1.5 rounded-lg border p-4 text-center hover:opacity-80"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
            >
              <div className="absolute top-1 right-1 flex opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={`Rename ${vault.name}`}
                  title={isOnline ? 'Rename vault' : 'Disabled while offline'}
                  className="rounded p-1 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:opacity-30"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => setRenameTarget({ id: vault.id, name: vault.name })}
                  disabled={!isOnline}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${vault.name}`}
                  title={isOnline ? 'Delete vault' : 'Disabled while offline'}
                  className="rounded p-1 hover:text-[var(--error)] disabled:cursor-not-allowed disabled:opacity-30"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => setDeleteTarget({ id: vault.id, name: vault.name })}
                  disabled={!isOnline}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <button type="button" className="flex w-full flex-col items-center gap-1.5" onClick={() => handleOpen(vault.id)}>
                <FolderOpen size={22} style={{ color: 'var(--accent-link)' }} />
                {/* line-clamp-2, not truncate — a short/medium vault name
                    (the common case) should read in full, not get cut off
                    to fit one line just because the card is compact. Only a
                    genuinely long name (>2 lines' worth) ellipsizes. */}
                <span className="line-clamp-2 w-full text-sm font-medium break-words" style={{ color: 'var(--text-primary)' }}>
                  {vault.name}
                </span>
                {/* Fixed-height row regardless of whether stats have
                    arrived yet — a skeleton placeholder holds the same
                    space a real stats line would, so the grid doesn't
                    visibly reflow the moment the async stats fetch resolves
                    after the vault list itself. */}
                <span className="flex h-3.5 items-center">
                  {stats.has(vault.id) ? (
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <FileText size={10} />
                      {stats.get(vault.id)!.noteCount}
                    </span>
                  ) : (
                    <span className="h-2.5 w-10 animate-pulse rounded" style={{ background: 'var(--bg-tertiary)' }} aria-hidden="true" />
                  )}
                </span>
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          title={isOnline ? undefined : 'Disabled while offline'}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm font-medium hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50"
          style={{ borderColor: 'var(--border)', color: 'var(--accent-link)' }}
          onClick={() => setCreateOpen(true)}
          disabled={!isOnline}
        >
          <Plus size={16} />
          New vault
        </button>

        {starredFiles.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Starred
            </h2>
            {/* Deliberately unbounded, and deliberately last — nothing sits
                below this section, so a long list just grows the page
                instead of needing its own scroll region the way the vault
                grid above does. */}
            <div className="flex flex-col gap-1.5">
              {starredFiles.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 hover:opacity-80"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
                >
                  <button
                    type="button"
                    aria-label={`Unstar ${item.name}`}
                    className="shrink-0 rounded p-1"
                    style={{ color: 'var(--accent-link)' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setUnstarTarget(item)
                    }}
                  >
                    <Star size={15} fill="currentColor" />
                  </button>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => openStarred(item)}>
                    <span className="truncate text-sm" style={{ color: 'var(--text-primary)' }}>
                      {item.mimeType === 'application/pdf' ? item.name : item.name.replace(/\.md$/, '')}
                    </span>
                    <span className="shrink-0 truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                      {item.vaultName}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
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
      <ConfirmModal
        isOpen={unstarTarget !== null}
        title="Unstar"
        message={unstarTarget ? `Unstar "${unstarTarget.name.replace(/\.md$/, '')}"?` : ''}
        onConfirm={handleUnstar}
        onClose={() => setUnstarTarget(null)}
      />
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
