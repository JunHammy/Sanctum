# Sanctum: Development Plan

> Companion doc to [Sanctum-Master-Plan.md](./Sanctum-Master-Plan.md). That file is the architecture/design reference (the "what" and "why"). This file is the execution plan (the "in what order, and how do I know it's done").

Repo: https://github.com/JunHammy/Sanctum.git — all work happens on `main` (solo project, no branching overhead needed at this stage).

---

## 0. Ground Rules

- Every phase below ends in a **runnable, deployed state**. No phase leaves the app more broken than the last.
- Commit early and often on `main`. Since this is a solo project there's no PR workflow — just keep commits scoped and message them clearly.
- Deploy to GitHub Pages continuously from Phase 0 onward, so "is it broken" is always answerable by visiting the live URL, not just `npm run dev`.
- Re-check `Sanctum-Master-Plan.md` section numbers referenced below (e.g. "MP §5.1") when implementing — this plan intentionally doesn't duplicate code snippets already written there.

---

## Phase 0: Project Scaffolding (target: 1-2 days)

Goal: empty app that builds, deploys, and shows a login button. Nothing functional yet.

- [ ] Google Cloud project + OAuth2 Client ID (MP §19)
- [ ] `npm create vite@latest` — React + TypeScript template
- [ ] Install dependencies from MP §21 dependency list
- [ ] Tailwind CSS configured, `globals.css` with the CSS variable theme from MP §14 wired in (dark theme only for now)
- [ ] Folder structure from MP §3 stubbed out (empty files/folders as placeholders where sensible — don't over-scaffold unused dirs)
- [ ] `vite-plugin-pwa` configured with manifest (MP §12)
- [ ] `.env.example` + `.env` (gitignored) with `VITE_GOOGLE_CLIENT_ID`
- [ ] GitHub Pages deploy pipeline (`gh-pages` package or GitHub Actions) — confirm a blank page deploys and loads
- [ ] React Router hash-mode routing skeleton (`#/login`, `#/vault`, `#/settings`) with placeholder route components

**Definition of done**: visiting the GitHub Pages URL shows a "Sign in with Google" button that does nothing yet, and the app doesn't 404 on refresh.

---

## Phase 1: Read-Only Vault (target: 2-3 weeks)

Goal: sign in, pick a Drive folder, browse it, read fully-rendered notes. No writing yet.

### 1a. Auth
- [ ] `auth.service.ts`: OAuth2 PKCE flow (MP §5.1)
- [ ] `auth.store.ts`: token state, sign-in/out
- [ ] `AuthGate.tsx` wraps the app; unauthenticated users see `LoginRoute`
- [ ] Token refresh via hidden iframe before expiry

### 1b. Drive plumbing
- [ ] `drive-api.ts` low-level REST wrapper + `drive.service.ts` (MP §5.2) — auth headers, 401 retry-once logic
- [ ] First-run vault folder picker (create "Sanctum" folder in Drive if missing, or let user pick)
- [ ] `.vault/config.json` created on first run (MP §7)
- [ ] Flat `files.list` fetch + client-side tree reconstruction from `parents` (MP §5.3 performance note — **build it this way from the start**, don't do naive recursive-per-folder calls)
- [ ] `vault.store.ts` + `useFileTree.ts`
- [ ] `FileTree.tsx` / `FileTreeNode.tsx` sidebar rendering

### 1c. Markdown rendering pipeline
- [ ] `markdown.service.ts`: markdown-it instance + plugin chain in the exact order specified in MP §6.1
- [ ] Custom plugins: wikilink (§6.3), callout, tag — start with wikilink + callout since those are structurally novel; tag is trivial
- [ ] KaTeX post-render pass (§6.2)
- [ ] highlight.js with the language subset from §6.4 (no more — avoid bundle bloat)
- [ ] `gray-matter` frontmatter extraction + `PropertiesPanel.tsx`
- [ ] Image path resolution (relative `assets/` paths → Drive blob URLs)
- [ ] `note.store.ts` + `useNote.ts`: load note by fileId, render, display

### 1d. Wiring it together
- [ ] `NoteView.tsx` / `MarkdownReader.tsx` — click file in tree → loads and renders
- [ ] Wikilink resolution + click-to-navigate (§17) — ghost link styling for unresolved targets is optional polish, can stub as plain dimmed text initially
- [ ] Responsive layout pass (sidebar collapses on mobile, MP §14 mobile layout)
- [ ] Manual QA pass: create a real test note in Drive with headings, math, code, a table, a callout, an image, a wikilink — confirm it all renders correctly

**Definition of done**: sign in on the deployed app, pick your real Drive vault folder, browse the tree, open notes, everything in MP §9 Tier 1 renders correctly, wikilinks navigate.

---

## Phase 2: Edit and Write (target: 1-2 weeks)

Goal: Sanctum becomes usable as a daily driver for writing, not just reading.

- [ ] CodeMirror 6 editor (`MarkdownEditor.tsx`) with markdown language support + one-dark theme
- [ ] Read/edit toggle (`ReadEditToggle.tsx`, `Ctrl+E`)
- [ ] Debounced auto-save (3s) + manual save (`Ctrl+S`) — `isDirty` flag surfaced in the tab UI
- [ ] Create note (blank + from `templates/`), create folder, rename, delete-to-trash (with confirm dialog)
- [ ] Clipboard image paste → upload to nearest `assets/` folder → insert markdown link
- [ ] Drag-and-drop file upload (same target as paste)
- [ ] Frontmatter editing in `PropertiesPanel.tsx` (add/edit/remove keys, not just display)

**Definition of done**: you can write and edit real study notes in Sanctum instead of Obsidian for a full session without hitting a missing feature that sends you back to Obsidian.

---

## Phase 3: Power Features (target: 2-3 weeks)

Goal: parity with the Obsidian workflows this app is meant to replace.

- [ ] MiniSearch full-text index (build on vault load, incremental update on save) + search UI
- [ ] Quick switcher (`Ctrl+O`)
- [ ] Tag browser sidebar panel
- [ ] Backlinks (§18) — build the map lazily/incrementally, don't block initial load on it for large vaults
- [ ] Table of contents (auto-generated from headings)
- [ ] Mermaid (lazy-loaded) and Plotly (lazy-loaded) chart/diagram rendering (§10)
- [ ] Chart.js (bundled) for lightweight charts
- [ ] YouTube/audio/PDF media embeds
- [ ] Note transclusion `![[Note]]`
- [ ] PDF export (`html2pdf.js` + `print.css`)
- [ ] Tab bar for multiple open notes

**Definition of done**: everything in MP §9 Tier 2 works; search, backlinks, and quick switcher make navigation as fast as Obsidian.

---

## Phase 4: Polish (ongoing, no fixed deadline)

Pull individually from MP §20 Phase 4 list as motivated — this phase is a backlog, not a sprint:

- [ ] Offline mode (service worker precache + IndexedDB read path when Drive is unreachable)
- [ ] Docx import (mammoth.js), HTML web clip (turndown.js)
- [ ] Full vault ZIP backup/export (JSZip)
- [ ] Block references, command palette, remaining keyboard shortcuts
- [ ] Split pane view, mobile swipe gestures
- [ ] Light theme
- [ ] Breadcrumbs, starred notes, recent files

---

## Testing Approach

No formal test suite is planned for v1 — this is a solo-use tool, and the master plan doesn't specify one. Instead:

- Maintain one **real test vault** in Drive (a few notes covering every Tier 1/2 content type) and manually re-check it after any change to the markdown pipeline.
- Before merging a phase as "done," do a manual pass on both desktop and mobile viewport.
- If a bug recurs more than once in the same area (e.g. wikilink resolution), that's the signal to add a lightweight unit test for that function specifically — not a blanket policy.

---

## Deployment

- Static hosting: GitHub Pages, deployed from `main` via `npm run deploy` (`gh-pages -d dist`) or a GitHub Actions workflow — pick one in Phase 0 and stick with it.
- No staging environment. Since this is single-user, the live URL doubles as the dev-verification target once Phase 0 is done.

---

## Explicitly Not Doing

See MP §23 — graph view, Obsidian plugin compat, canvas, Dataview, multi-user, native mobile, git-based note history, AI integration. Don't scope-creep these in during any phase above.

---

## Next Action

Start Phase 0. First concrete step: create the Google Cloud project and OAuth2 credentials (MP §19), since the client ID is needed before the auth scaffolding in Phase 0 can be tested end-to-end.
