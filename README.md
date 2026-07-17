# Sanctum

A private, free, all-in-one notes app. Markdown-native, Google Drive-backed, zero-cost, zero-server.

Sanctum is a Progressive Web App for reading, writing, and organizing markdown notes stored in your own Google Drive. It replicates the best parts of Obsidian (dark/light UI, folder tree, rich rendering, wikilinks) without a server, a subscription, or vendor lock-in — notes stay as plain `.md` files you own, in your own Drive.

**Live**: https://junhammy.github.io/Sanctum/

## What it does

- **Editing**: block-based markdown editor (click a block to edit it, click away to render) with drag-to-reorder, multi-block select/delete, undo/redo, and full offline read access.
- **Rich content**: wikilinks (`[[Note]]`, headings, block references), tags, callouts, footnotes, transclusion/embeds, Mermaid/Chart.js/Plotly diagrams, KaTeX math (visual equation editor + raw LaTeX), a visual table editor, and PDF viewing.
- **Runnable code**: Python (via Pyodide/WASM) and JavaScript code blocks execute right in the browser, with output persisted back into the note.
- **Vault management**: multiple independent vaults, drag-and-drop reorganizing, starred notes, breadcrumbs, full-text search, quick switcher, command palette.
- **Import/export**: docx, CSV, xlsx, `.ipynb`, Markdown, and web-clipping in; PDF, Word, and Markdown out; full vault ZIP backup.
- **PWA**: installable, offline-capable, works on desktop and mobile.

## Docs

The master plan and dev plan live locally in `Reference Docs/` (gitignored, not published here).

## Status

Actively developed, in daily personal use. Core read/write/organize functionality, multi-vault support, and the Phase 4 polish backlog (see dev plan) are ongoing — most planned features are built; remaining work is incremental fixes and refinements surfaced through real use.
