import { create } from 'zustand'
import * as driveService from '../services/drive.service'
import * as cacheService from '../services/cache.service'
import { renderNote, renderBody, serializeFrontmatter } from '../services/markdown.service'
import { useSearchStore } from './search.store'
import { useBacklinksStore } from './backlinks.store'
import { useTagsStore } from './tags.store'
import { useVaultStore } from './vault.store'
import { useToastStore } from './toast.store'
import { useNetworkStore } from './network.store'
import { toUserMessage, logError, isOfflineError } from '../lib/error-messages'
import { findFileModifiedTime } from '../lib/vault-tree'

const AUTO_SAVE_DELAY_MS = 3000
const MAX_UNDO_ENTRIES = 50

interface NoteSnapshot {
  rawBody: string
  frontmatter: Record<string, unknown>
  frontmatterBlock: string
}

interface NoteState {
  activeNoteId: string | null
  html: string
  rawBody: string
  frontmatterBlock: string
  frontmatter: Record<string, unknown>
  isLoading: boolean
  isReadMode: boolean
  isDirty: boolean
  isSaving: boolean
  error: string | null
  // True when the currently-displayed note came from cache.service.ts
  // rather than a fresh network read. Purely informational — editing is
  // gated globally by network.store's isOnline, independent of whether this
  // particular note happens to be showing cached content.
  isOfflineContent: boolean
  undoStack: NoteSnapshot[]
  redoStack: NoteSnapshot[]
  // Incremented on every undo/redo. BlockEditor is deliberately uncontrolled
  // (it never resyncs to external `value` changes, to avoid fighting the
  // cursor while typing) — but undo/redo *is* an external change it needs
  // to reflect, so NoteView folds this into BlockEditor's `key` to force a
  // clean remount (re-split from the reverted rawBody) exactly when it
  // changes, and not on every normal edit.
  undoVersion: number
  // Set right before navigating to a note from a search result (or a
  // cross-note wikilink), so the note view knows to scroll to and
  // highlight a specific line once it's rendered, rather than just landing
  // at the top. Not touched by openNote — it needs to survive the
  // navigation that triggers openNote in the first place.
  //
  // Paired with the target fileId, not just a bare line number — setting
  // this happens *before* navigate() is called, which means there's a real
  // window where this store already has the new target but the currently
  // rendered note is still the *previous* one (openNote's own fetch for
  // the new note hasn't resolved yet). Without the fileId to check against,
  // a consumer would fire against that stale content, then clear the
  // target — leaving nothing to trigger the scroll once the correct note
  // actually finishes loading a moment later. See MarkdownReader.tsx.
  pendingScroll: { fileId: string; line: number } | null
  // Set right before a Read/Edit toggle (toggleReadModePreservingScroll in
  // scroll-to-line.ts), consumed by whichever content component mounts next
  // via its own useLayoutEffect (consumePendingScrollAnchor) — see that
  // file for why this replaced an external MutationObserver-based design.
  // No fileId pairing needed here (unlike pendingScroll above): toggling
  // always happens within the note that's already open, never across a
  // navigation.
  pendingScrollAnchor: number | null
  openNote: (fileId: string) => Promise<void>
  updateContent: (newBody: string) => void
  updateFrontmatterField: (key: string, value: unknown) => void
  removeFrontmatterField: (key: string) => void
  toggleReadMode: () => void
  // Explicit "go to Read mode" rather than reusing toggleReadMode — jumping
  // to a search/backlink/tag hit needs to *land* in Read mode (that's where
  // the flash-highlight lives), not flip whatever mode happened to already
  // be active. openNote already resets to Read mode on its own, but only
  // when actually switching notes; jumping to something inside the note
  // you're *already* viewing doesn't re-trigger openNote at all.
  enterReadMode: () => void
  saveNote: () => Promise<void>
  undo: () => void
  redo: () => void
  reset: () => void
  setPendingScroll: (target: { fileId: string; line: number } | null) => void
  setPendingScrollAnchor: (line: number | null) => void
}

// Raw content for every note opened this session, keyed by fileId — checked
// synchronously by openNote before it ever touches the network, so
// switching back to a note you (or an open tab) already visited displays
// instantly instead of showing a loading spinner for a fresh Drive fetch
// every single time. Confirmed as a real, repeatedly-felt gap from testing:
// there was no reason switching between two already-open tabs should ever
// re-fetch from scratch. Deliberately separate from cache.service.ts's
// IndexedDB cache (which exists for cross-session/offline persistence and
// costs an async DB read either way) — this is plain in-memory, alive only
// for the current page session, cleared on reload. Not tied to tab open/
// close lifecycle; a closed tab's entry just sits here harmlessly in case
// the same note gets reopened later this session.
//
// Stale-while-revalidate, not "trust the cache forever": openNote still
// kicks off a real Drive fetch every time (unless offline), it just no
// longer *blocks* the switch on it — the cached version shows immediately,
// and the fresh read silently replaces it a moment later only if the
// content actually changed (e.g. edited from another device) since it was
// last cached.
const sessionContentCache = new Map<string, string>()

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

// Captures the state *before* the current burst of edits the first time
// something changes after a quiet period, not on every keystroke — the
// undo stack should feel like "undo my last batch of typing," not require
// 40 presses to get back past one sentence. Committed into undoStack only
// once the burst settles (the debounce timer actually fires).
let pendingUndoSnapshot: NoteSnapshot | null = null

function captureUndoSnapshotIfNeeded(get: () => NoteState) {
  if (pendingUndoSnapshot) return
  const { rawBody, frontmatter, frontmatterBlock } = get()
  pendingUndoSnapshot = { rawBody, frontmatter, frontmatterBlock }
}

// Shared by openNote's two paths (already offline when called, or a network
// read that just failed with a connectivity-shaped error) — falls back to
// whatever cache.service.ts has for this note, or an honest "not available
// offline" error if it was never opened on this device. Re-checks
// activeNoteId after its own await (the same staleness-guard convention
// vault.store.ts's loadActiveVaultTree already uses) since a rapid second
// openNote call for a different note could otherwise land here late and
// overwrite what's now supposed to be showing.
async function loadNoteFromCache(get: () => NoteState, set: (partial: Partial<NoteState>) => void, fileId: string) {
  const cached = await cacheService.getCachedContent(fileId)
  if (get().activeNoteId !== fileId) return
  if (cached) {
    const { html, frontmatter, frontmatterBlock, rawBody } = renderNote(cached.raw)
    set({ html, frontmatter, frontmatterBlock, rawBody, isLoading: false, isOfflineContent: true, error: null })
    return
  }
  set({
    isLoading: false,
    isOfflineContent: false,
    error: "This note hasn't been opened on this device before, so it isn't available offline — connect to load it.",
  })
}

function scheduleAutoSave(get: () => NoteState, set: (partial: Partial<NoteState>) => void, save: () => void) {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    if (pendingUndoSnapshot) {
      const undoStack = [...get().undoStack, pendingUndoSnapshot].slice(-MAX_UNDO_ENTRIES)
      set({ undoStack, redoStack: [] })
      pendingUndoSnapshot = null
    }
    save()
  }, AUTO_SAVE_DELAY_MS)
}

export const useNoteStore = create<NoteState>()((set, get) => ({
  activeNoteId: null,
  html: '',
  rawBody: '',
  frontmatterBlock: '',
  frontmatter: {},
  isLoading: false,
  isReadMode: true,
  isDirty: false,
  isSaving: false,
  error: null,
  isOfflineContent: false,
  undoStack: [],
  redoStack: [],
  undoVersion: 0,
  pendingScroll: null,
  pendingScrollAnchor: null,

  setPendingScroll: (target) => set({ pendingScroll: target }),
  setPendingScrollAnchor: (line) => set({ pendingScrollAnchor: line }),

  openNote: async (fileId) => {
    const current = get()

    // Switching notes with unsaved edits: flush the save immediately rather
    // than losing it (or letting a stale debounce timer fire later against
    // whatever note happens to be open by then).
    if (current.activeNoteId && current.activeNoteId !== fileId && current.isDirty) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
      await current.saveNote()
    }

    // Undo history is per-note, not global — a fresh note shouldn't be
    // undoable back into whatever the previously open note looked like.
    pendingUndoSnapshot = null

    // Already visited this session — render it immediately (isLoading stays
    // false, no spinner) instead of waiting on the network read below,
    // which still runs regardless to silently pick up any real change.
    const cachedRaw = sessionContentCache.get(fileId)
    const cachedRendered = cachedRaw !== undefined ? renderNote(cachedRaw) : null

    // Set activeNoteId immediately so useNote's effect doesn't re-fire on
    // every re-render while this is in flight (or after it fails).
    set({
      isLoading: cachedRendered === null,
      error: null,
      activeNoteId: fileId,
      isDirty: false,
      isReadMode: true,
      undoStack: [],
      redoStack: [],
      undoVersion: 0,
      // A toggle that set this but got abandoned (e.g. the user navigated
      // away before BlockEditor's Suspense resolved) shouldn't leak into
      // whatever note opens next and scroll it to an unrelated line.
      pendingScrollAnchor: null,
      ...(cachedRendered
        ? {
            html: cachedRendered.html,
            frontmatter: cachedRendered.frontmatter,
            frontmatterBlock: cachedRendered.frontmatterBlock,
            rawBody: cachedRendered.rawBody,
            isOfflineContent: false,
          }
        : {}),
    })
    if (!useNetworkStore.getState().isOnline) {
      if (!cachedRendered) await loadNoteFromCache(get, set, fileId)
      return
    }

    try {
      const raw = await driveService.readFile(fileId)
      sessionContentCache.set(fileId, raw)
      // A rapid second openNote call for a different note could land here
      // late, after the user's already moved on — same staleness guard
      // convention as loadNoteFromCache/vault.store's loadActiveVaultTree.
      if (get().activeNoteId !== fileId) return
      // Skip the redundant re-render when the fresh read confirms the
      // cached version already showing was correct — a same-value string
      // wouldn't visibly change anything, but frontmatter is a freshly
      // built object either way and would otherwise still trigger every
      // subscribed component to re-render for nothing.
      if (raw !== cachedRaw) {
        const { html, frontmatter, frontmatterBlock, rawBody } = renderNote(raw)
        set({ html, frontmatter, frontmatterBlock, rawBody, isOfflineContent: false })
      }
      set({ isLoading: false })
      // Fire-and-forget write-through — closes the gap where this store's
      // own read path never touched cache.service.ts at all, while
      // search/tags/backlinks silently did as a side effect of indexing.
      // Both now read *and* write the same cache, so they stay in sync.
      const modifiedTime = findFileModifiedTime(useVaultStore.getState().fileTree, fileId)
      if (modifiedTime) cacheService.setCachedContent(fileId, { raw, modifiedTime })
    } catch (err) {
      if (isOfflineError(err)) {
        if (!cachedRendered) await loadNoteFromCache(get, set, fileId)
        else set({ isLoading: false })
        return
      }
      const message = toUserMessage(err, 'Could not load this note from Google Drive.')
      logError('note.openNote', err)
      useToastStore.getState().show(message, 'error')
      // Don't paper over content that's already showing fine from cache
      // with an error banner — only surface the error when there was
      // nothing to fall back to.
      set({ isLoading: false, error: cachedRendered ? null : message })
    }
  },

  updateContent: (newBody) => {
    captureUndoSnapshotIfNeeded(get)
    set({ rawBody: newBody, html: renderBody(newBody), isDirty: true })
    scheduleAutoSave(get, set, () => get().saveNote())
  },

  // Once frontmatter is actually edited, the original verbatim block gets
  // regenerated via serializeFrontmatter() from here on for this note —
  // see the comment on ExtractedFrontmatter in markdown.service.ts for why
  // it starts out verbatim instead of always-regenerated.
  updateFrontmatterField: (key, value) => {
    captureUndoSnapshotIfNeeded(get)
    const nextFrontmatter = { ...get().frontmatter, [key]: value }
    set({ frontmatter: nextFrontmatter, frontmatterBlock: serializeFrontmatter(nextFrontmatter), isDirty: true })
    scheduleAutoSave(get, set, () => get().saveNote())
  },

  removeFrontmatterField: (key) => {
    captureUndoSnapshotIfNeeded(get)
    const nextFrontmatter = { ...get().frontmatter }
    delete nextFrontmatter[key]
    set({ frontmatter: nextFrontmatter, frontmatterBlock: serializeFrontmatter(nextFrontmatter), isDirty: true })
    scheduleAutoSave(get, set, () => get().saveNote())
  },

  toggleReadMode: () => set((s) => ({ isReadMode: !s.isReadMode })),
  enterReadMode: () => set({ isReadMode: true }),

  // Whole-note undo/redo, independent of CodeMirror's per-block history
  // (which resets every time a different block is clicked into — that's
  // the gap this fills). Not wired through captureUndoSnapshotIfNeeded/
  // scheduleAutoSave's burst-grouping since undo/redo are themselves
  // discrete, deliberate actions.
  undo: () => {
    const { undoStack, redoStack, rawBody, frontmatter, frontmatterBlock } = get()
    if (undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]
    pendingUndoSnapshot = null
    set((s) => ({
      ...previous,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, { rawBody, frontmatter, frontmatterBlock }].slice(-MAX_UNDO_ENTRIES),
      html: renderBody(previous.rawBody),
      isDirty: true,
      undoVersion: s.undoVersion + 1,
    }))
    scheduleAutoSave(get, set, () => get().saveNote())
  },

  redo: () => {
    const { undoStack, redoStack, rawBody, frontmatter, frontmatterBlock } = get()
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    pendingUndoSnapshot = null
    set((s) => ({
      ...next,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, { rawBody, frontmatter, frontmatterBlock }].slice(-MAX_UNDO_ENTRIES),
      html: renderBody(next.rawBody),
      isDirty: true,
      undoVersion: s.undoVersion + 1,
    }))
    scheduleAutoSave(get, set, () => get().saveNote())
  },

  saveNote: async () => {
    const { activeNoteId, frontmatterBlock, rawBody, isDirty } = get()
    if (!activeNoteId || !isDirty) return
    // Silent no-op while offline — checked up front rather than letting the
    // driveService.updateFile call attempt and throw via assertOnline. This
    // is what keeps autosave from spamming a toast every 3s while the user
    // keeps typing offline: isDirty stays true (so "Unsaved changes" keeps
    // showing honestly), and the pending edit is picked up automatically by
    // the next autosave tick after reconnecting, or the reconnect hook's
    // explicit flush.
    if (!useNetworkStore.getState().isOnline) return

    set({ isSaving: true, error: null })
    try {
      await driveService.updateFile(activeNoteId, frontmatterBlock + rawBody)
      // Keeps openNote's session cache in sync with what was just saved —
      // without this, navigating away and back to this note would briefly
      // show the stale pre-edit version from cache before the network
      // revalidation caught up and silently replaced it, which for the
      // user's own just-made edit reads as "did my change not save?"
      // rather than the harmless flash it's meant to be for unrelated
      // remote changes.
      sessionContentCache.set(activeNoteId, frontmatterBlock + rawBody)
      set({ isSaving: false, isDirty: false })
      // Single-entry reindex, not a full rebuild — keeps search results
      // current with the just-saved content without waiting for the next
      // vault load.
      useSearchStore.getState().updateIndexForNote(activeNoteId, frontmatterBlock + rawBody)
      useBacklinksStore
        .getState()
        .updateForNote(activeNoteId, frontmatterBlock + rawBody, useVaultStore.getState().fileTree)
      useTagsStore.getState().updateForNote(activeNoteId, frontmatterBlock + rawBody)
    } catch (err) {
      const message = toUserMessage(err, 'Could not save your changes to Google Drive.')
      logError('note.saveNote', err)
      useToastStore.getState().show(message, 'error')
      set({ isSaving: false, error: message })
    }
  },

  // Called on sign-out, and by VaultRoute whenever the URL has no fileId
  // (no note open — e.g. after closing the last tab). This store is a
  // global singleton independent of React's component tree, so it
  // otherwise survives untouched — including a stale `error` from a failed
  // load and an `activeNoteId` still pointing at a note that isn't open
  // anymore. On sign-out specifically, without this, re-clicking the same
  // note after signing back in with a fresh token would silently do
  // nothing: openNote's caller only refetches when `fileId !== activeNoteId`,
  // and that guard was still satisfied by the leftover id from before, so
  // the old error just sat there forever.
  reset: () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    pendingUndoSnapshot = null
    set({
      activeNoteId: null,
      html: '',
      rawBody: '',
      frontmatterBlock: '',
      frontmatter: {},
      isLoading: false,
      isReadMode: true,
      isDirty: false,
      isSaving: false,
      error: null,
      isOfflineContent: false,
      undoStack: [],
      redoStack: [],
      undoVersion: 0,
      pendingScroll: null,
    })
  },
}))
