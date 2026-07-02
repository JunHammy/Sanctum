# Sanctum: Master System Plan v2

> A private, free, all-in-one notes app. Built for me, by me. Markdown-native, Google Drive-backed, zero-cost, zero-server.

---

## 1. Vision

Sanctum is a Progressive Web App (PWA) for reading, writing, and organizing markdown notes stored in Google Drive. It replicates the best parts of Obsidian (dark UI, folder tree, rich rendering, wikilinks) without Obsidian, without a server, without a subscription. It runs entirely in the browser. Notes are plain `.md` files. No vendor lock-in. No proprietary formats.

Initially built for quantum finance self-study, but designed as a general-purpose knowledge vault for anything: programming, math, languages, cooking, journaling, whatever.

---

## 2. Architecture Overview

```
USER'S DEVICE (phone / laptop / tablet)
+-----------------------------------------------------------+
|  Browser                                                   |
|  +-------------------------------------------------------+ |
|  |  Sanctum PWA (React SPA)                              | |
|  |                                                       | |
|  |  UI Layer        State Layer        Service Layer     | |
|  |  +-----------+   +-------------+   +---------------+  | |
|  |  | Components|<->| Zustand     |<->| DriveService  |  | |
|  |  | (React)   |   | stores      |   | AuthService   |  | |
|  |  +-----------+   +-------------+   | CacheService  |  | |
|  |                                    | SearchService |  | |
|  |                                    | MarkdownSvc   |  | |
|  |                                    +-------+-------+  | |
|  +--------------------------------------------|---------+ |
+-----------------------------------------------|----------+
                                                | HTTPS
                                                v
                                    +-----------+----------+
                                    |    Google Drive API   |
                                    |    googleapis.com     |
                                    +-----------------------+

STATIC HOSTING (GitHub Pages / Cloudflare Pages)
Serves HTML + JS + CSS bundle only. Never sees user data.
```

### Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Framework | React 18+ with TypeScript | Ecosystem, familiarity, library support |
| Build tool | Vite | Fast dev server, good tree-shaking, PWA plugin |
| State management | Zustand | Minimal boilerplate, no provider nesting, works with async |
| Routing | React Router v6 (hash mode) | Hash mode works on static hosts without server config |
| Styling | Tailwind CSS + CSS variables | Utility-first for speed, CSS vars for theming |
| Editor | CodeMirror 6 | Same engine as Obsidian, excellent markdown support |
| Markdown | markdown-it + plugin chain | Extensible, well-maintained, handles all our custom syntax |
| Storage backend | Google Drive API v3 | Free 15GB, user-owned, REST API, no server needed |
| Auth | Google OAuth2 PKCE | Client-side safe, no client secret needed |
| Offline cache | IndexedDB via idb | Lightweight wrapper, stores note content and file tree |
| Search | MiniSearch | Tiny (~10KB), fast, fuzzy matching, runs in browser |
| PWA | vite-plugin-pwa (Workbox) | Service worker generation, precaching, offline shell |

---

## 3. Codebase Structure

```
sanctum/
  public/
    favicon.svg
    manifest.json                    # PWA manifest
    icons/                           # App icons (192, 512)
  src/
    main.tsx                         # React entry point
    App.tsx                          # Root component, router setup, auth gate
    vite-env.d.ts                    # Vite type declarations

    routes/
      index.tsx                      # Route definitions
      VaultRoute.tsx                 # Main vault view (sidebar + content)
      LoginRoute.tsx                 # Auth landing page
      SettingsRoute.tsx              # User preferences

    components/
      layout/
        AppShell.tsx                 # Top-level layout: header + sidebar + content
        Header.tsx                   # Top bar: logo, search trigger, theme toggle, avatar
        Sidebar.tsx                  # Left panel container (tree + tags + backlinks)
        ContentPane.tsx              # Right panel: note viewer/editor area

      sidebar/
        FileTree.tsx                 # Recursive folder/file tree
        FileTreeNode.tsx             # Single node (folder or file) with expand/collapse
        TagBrowser.tsx               # List of all tags, clickable to filter
        BacklinksPanel.tsx           # Notes that link to the current note
        QuickSwitcher.tsx            # Ctrl+O modal for fuzzy file search

      editor/
        NoteView.tsx                 # Container: switches between reader and editor
        MarkdownReader.tsx           # Rendered markdown (read-only mode)
        MarkdownEditor.tsx           # CodeMirror 6 (edit mode)
        PropertiesPanel.tsx          # YAML frontmatter display/edit
        TableOfContents.tsx          # Auto-generated from headings
        ReadEditToggle.tsx           # Toggle button component

      markdown/
        MarkdownRenderer.tsx         # Core: takes raw md string, returns rendered HTML
        renderers/
          CalloutRenderer.tsx        # Callout/admonition blocks
          WikilinkRenderer.tsx       # [[wikilink]] click handler + styling
          ChartRenderer.tsx          # Plotly/Chart.js code block handler
          MermaidRenderer.tsx        # Mermaid diagram code block handler
          EmbedRenderer.tsx          # ![[note]] transclusion
          MediaRenderer.tsx          # Image/audio/video/YouTube/PDF embeds
          CodeBlockRenderer.tsx      # Syntax-highlighted code blocks
          MathRenderer.tsx           # KaTeX inline/block math

      common/
        Modal.tsx                    # Reusable modal wrapper
        ContextMenu.tsx              # Right-click menu
        Tooltip.tsx                  # Hover tooltips
        LoadingSpinner.tsx           # Loading state
        ErrorBoundary.tsx            # React error boundary
        Icon.tsx                     # Icon wrapper (lucide-react)
        CommandPalette.tsx           # Ctrl+P command search

      auth/
        LoginButton.tsx              # Google sign-in button
        AuthGate.tsx                 # Wraps app, shows login if not authenticated
        AvatarMenu.tsx               # User avatar + dropdown (sign out, settings)

    services/
      auth.service.ts               # Google OAuth2 PKCE flow
      drive.service.ts              # Google Drive API wrapper (CRUD, folder ops)
      cache.service.ts              # IndexedDB read/write for offline
      search.service.ts             # MiniSearch index build, query, update
      markdown.service.ts           # markdown-it setup, plugin chain, rendering
      export.service.ts             # PDF export, ZIP backup, docx import
      media.service.ts              # Image upload, clipboard paste, media URL resolution

    stores/
      auth.store.ts                 # Auth state: token, user info, sign-in/out
      vault.store.ts                # Vault state: file tree, current folder, loading
      note.store.ts                 # Active note: content, metadata, dirty flag, tabs
      ui.store.ts                   # UI state: sidebar open, theme, modals, panels
      search.store.ts               # Search state: query, results, index status

    hooks/
      useAuth.ts                    # Auth convenience hook
      useNote.ts                    # Load/save note, manage dirty state
      useFileTree.ts                # Fetch and manage file tree from Drive
      useSearch.ts                  # Search query and results
      useKeyboard.ts                # Global keyboard shortcuts
      useMediaUpload.ts             # Paste/drag-drop image handling
      useDebounce.ts                # Debounce utility
      useTheme.ts                   # Theme toggle logic
      useBacklinks.ts               # Compute backlinks for current note
      useTOC.ts                     # Extract headings for table of contents

    lib/
      drive-api.ts                  # Low-level Google Drive REST calls
      markdown-plugins/
        plugin-wikilink.ts          # [[wikilink]] parser for markdown-it
        plugin-callout.ts           # > [!TYPE] callout parser
        plugin-mark.ts              # ==highlight== parser
        plugin-task-list.ts         # - [ ] checkbox parser
        plugin-chart.ts             # ```plotly / ```chartjs code block interceptor
        plugin-mermaid.ts           # ```mermaid code block interceptor
        plugin-embed.ts             # ![[note]] transclusion parser
        plugin-tag.ts               # #tag inline parser
      katex-setup.ts                # KaTeX config and rendering helpers
      highlight-setup.ts            # highlight.js language registration
      chart-setup.ts                # Plotly/Chart.js lazy loading and rendering
      mermaid-setup.ts              # Mermaid lazy loading and rendering
      theme.ts                      # CSS variable definitions, theme switching

    types/
      drive.types.ts                # Google Drive API response types
      vault.types.ts                # VaultFile, VaultFolder, FileTreeNode types
      note.types.ts                 # NoteContent, FrontMatter, NoteTab types
      search.types.ts               # SearchResult, SearchIndex types
      chart.types.ts                # PlotlyConfig, ChartJSConfig types
      markdown.types.ts             # RendererOptions, PluginConfig types

    config/
      constants.ts                  # API URLs, scopes, cache keys, limits
      callout-types.ts              # Callout type definitions (icons, colors)
      default-settings.ts           # Default user preferences

    styles/
      globals.css                   # Tailwind base + CSS variables + theme definitions
      markdown.css                  # Rendered markdown typography and spacing
      code-theme.css                # Code block syntax highlighting theme
      print.css                     # PDF export print stylesheet

  index.html                        # Vite entry HTML
  vite.config.ts                    # Vite config with PWA plugin
  tailwind.config.ts                # Tailwind config with custom theme
  tsconfig.json
  package.json
  .env.example                      # VITE_GOOGLE_CLIENT_ID placeholder
  README.md
```

---

## 4. State Management

Five Zustand stores, kept small and focused. They talk to each other via `getState()` when needed, never circular.

### auth.store.ts

```typescript
interface AuthState {
  token: string | null;
  user: { name: string; email: string; avatar: string } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;       // triggers OAuth PKCE flow
  signOut: () => void;               // clears token, resets all stores
  refreshToken: () => Promise<void>; // silent refresh via hidden iframe
}
```

### vault.store.ts

```typescript
interface VaultState {
  rootFolderId: string | null;       // Drive folder ID of the vault root
  fileTree: FileTreeNode[];          // nested array of folders/files
  isLoading: boolean;
  error: string | null;
  setVaultRoot: (folderId: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  createFile: (parentId: string, name: string, content?: string) => Promise<void>;
  createFolder: (parentId: string, name: string) => Promise<void>;
  renameItem: (id: string, newName: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  moveItem: (id: string, newParentId: string) => Promise<void>;
}
```

### note.store.ts

```typescript
interface NoteState {
  activeNoteId: string | null;
  tabs: NoteTab[];                   // open note tabs
  content: string;                   // raw markdown of active note
  frontmatter: FrontMatter | null;   // parsed YAML
  isDirty: boolean;                  // unsaved changes
  isReadMode: boolean;               // read vs edit toggle
  openNote: (fileId: string) => Promise<void>;
  closeTab: (fileId: string) => void;
  switchTab: (fileId: string) => void;
  saveNote: () => Promise<void>;
  updateContent: (newContent: string) => void;
  toggleReadMode: () => void;
}
```

### ui.store.ts

```typescript
interface UIState {
  sidebarOpen: boolean;
  theme: "dark" | "light";
  activePanel: "files" | "tags" | "backlinks" | "search";
  quickSwitcherOpen: boolean;
  commandPaletteOpen: boolean;
  toggleSidebar: () => void;
  toggleTheme: () => void;
  setPanel: (panel: string) => void;
}
```

### search.store.ts

```typescript
interface SearchState {
  query: string;
  results: SearchResult[];
  indexReady: boolean;
  buildIndex: (files: VaultFile[]) => Promise<void>;
  search: (query: string) => void;
  updateIndexEntry: (file: VaultFile) => void;
}
```

---

## 5. Google Drive Integration

### 5.1 OAuth2 PKCE Flow

The app uses Authorization Code flow with PKCE (Proof Key for Code Exchange). This is the recommended flow for public clients (SPAs with no backend). No client secret is needed.

```
1. User clicks "Sign in with Google"

2. App generates:
   - code_verifier: random 43-128 char string
   - code_challenge: base64url(SHA256(code_verifier))

3. App redirects to:
   https://accounts.google.com/o/oauth2/v2/auth?
     client_id=YOUR_CLIENT_ID
     &redirect_uri=https://yourapp.github.io
     &response_type=code
     &scope=https://www.googleapis.com/auth/drive.file
     &code_challenge=CHALLENGE
     &code_challenge_method=S256
     &access_type=online

4. User grants consent. Google redirects back with ?code=AUTH_CODE

5. App exchanges code for token:
   POST https://oauth2.googleapis.com/token
   {
     client_id: YOUR_CLIENT_ID,
     code: AUTH_CODE,
     code_verifier: VERIFIER,
     grant_type: authorization_code,
     redirect_uri: https://yourapp.github.io
   }

6. Response: { access_token, expires_in, token_type, scope }

7. Store token in memory (Zustand store). Set a timer to refresh
   before expiry.
```

**Token refresh**: before the token expires (typically 1 hour), redirect the user through the consent flow again in a hidden iframe with `prompt=none`. If the user's Google session is still active, this silently returns a new token. If it fails, prompt the user to sign in again.

**Sign out**: clear the token from the Zustand store, clear IndexedDB cache, and call `google.accounts.oauth2.revoke(token)` to revoke access.

### 5.2 Drive Service API Wrapper

All Drive API calls go through a single service (`drive.service.ts`) that handles auth headers, error handling, retries, and response parsing. Never call `fetch("googleapis.com/...")` directly from components.

```typescript
// Core pattern for all Drive API calls
class DriveService {
  private token: string;

  private async request(url: string, options?: RequestInit): Promise<any> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...options?.headers,
      },
    });

    if (response.status === 401) {
      // Token expired, trigger refresh
      await useAuthStore.getState().refreshToken();
      this.token = useAuthStore.getState().token!;
      return this.request(url, options); // retry once
    }

    if (!response.ok) {
      throw new DriveApiError(response.status, await response.text());
    }

    return response.json();
  }

  // List children of a folder
  async listFolder(folderId: string): Promise<DriveFile[]> {
    const query = `'${folderId}' in parents and trashed = false`;
    const fields = "files(id,name,mimeType,modifiedTime,size,parents)";
    const res = await this.request(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${fields}&orderBy=name&pageSize=1000`
    );
    return res.files;
  }

  // Read file content as text
  async readFile(fileId: string): Promise<string> {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    return res.text();
  }

  // Read file content as binary (for images)
  async readFileBlob(fileId: string): Promise<Blob> {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    return res.blob();
  }

  // Create a new text file
  async createFile(parentId: string, name: string, content: string): Promise<DriveFile> {
    const metadata = { name, parents: [parentId], mimeType: "text/markdown" };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([content], { type: "text/markdown" }));

    return this.request(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime",
      { method: "POST", body: form }
    );
  }

  // Update file content
  async updateFile(fileId: string, content: string): Promise<DriveFile> {
    return this.request(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: { "Content-Type": "text/markdown" },
        body: content,
      }
    );
  }

  // Upload binary file (image, PDF, etc.)
  async uploadBinary(parentId: string, name: string, blob: Blob, mimeType: string): Promise<DriveFile> {
    const metadata = { name, parents: [parentId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", blob, name);

    return this.request(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime",
      { method: "POST", body: form }
    );
  }

  // Create folder
  async createFolder(parentId: string, name: string): Promise<DriveFile> {
    return this.request(
      "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
        }),
      }
    );
  }

  // Rename file or folder
  async rename(fileId: string, newName: string): Promise<void> {
    await this.request(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      }
    );
  }

  // Move to trash
  async trash(fileId: string): Promise<void> {
    await this.request(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      }
    );
  }

  // Search files by name or content
  async search(query: string, folderId: string): Promise<DriveFile[]> {
    const q = `'${folderId}' in parents and fullText contains '${query}' and trashed = false`;
    const fields = "files(id,name,mimeType,modifiedTime)";
    const res = await this.request(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${fields}`
    );
    return res.files;
  }
}
```

### 5.3 Recursive File Tree Building

The file tree is built by recursively listing folder contents. This happens on initial vault load and on manual refresh.

```typescript
async function buildFileTree(folderId: string, drive: DriveService): Promise<FileTreeNode[]> {
  const items = await drive.listFolder(folderId);
  const nodes: FileTreeNode[] = [];

  for (const item of items) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      // Skip the .vault config folder from display
      if (item.name === ".vault") continue;

      const children = await buildFileTree(item.id, drive);
      nodes.push({
        id: item.id,
        name: item.name,
        type: "folder",
        children,
        expanded: false,
      });
    } else if (item.name.endsWith(".md")) {
      nodes.push({
        id: item.id,
        name: item.name,
        type: "file",
        modifiedTime: item.modifiedTime,
      });
    } else {
      // Non-markdown files (images, PDFs, etc.) tracked but not shown in main tree
      nodes.push({
        id: item.id,
        name: item.name,
        type: "attachment",
        mimeType: item.mimeType,
      });
    }
  }

  // Sort: folders first (alphabetical), then files (alphabetical)
  return nodes.sort((a, b) => {
    if (a.type === "folder" && b.type !== "folder") return -1;
    if (a.type !== "folder" && b.type === "folder") return 1;
    return a.name.localeCompare(b.name);
  });
}
```

**Performance note**: for large vaults (200+ files), this recursive listing can be slow due to one API call per folder. Optimization: use a single `drive.files.list` with `q: trashed = false` and no parent filter to get ALL files in the vault, then reconstruct the tree client-side using `parents` field. This reduces N API calls to 1 (possibly paginated).

---

## 6. Markdown Rendering Pipeline

### 6.1 Plugin Chain Order

Order matters. Plugins that transform syntax must run before plugins that render HTML.

```typescript
import MarkdownIt from "markdown-it";
import mk from "markdown-it-mark";              // ==highlight==
import footnote from "markdown-it-footnote";     // [^1]
import taskList from "markdown-it-task-lists";   // - [ ]

import { wikilinkPlugin } from "./plugins/plugin-wikilink";
import { calloutPlugin } from "./plugins/plugin-callout";
import { tagPlugin } from "./plugins/plugin-tag";
import { chartPlugin } from "./plugins/plugin-chart";
import { mermaidPlugin } from "./plugins/plugin-mermaid";
import { embedPlugin } from "./plugins/plugin-embed";

export function createMarkdownRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,           // allow raw HTML in notes
    linkify: true,        // auto-detect URLs
    typographer: true,    // smart quotes, dashes
    breaks: false,        // GFM: newline = <br>? (false = Obsidian default)
    highlight: (str, lang) => highlightCode(str, lang),
  });

  // Plugin order:
  // 1. Syntax extensions (parse phase)
  md.use(mk);                          // ==highlight==
  md.use(footnote);                    // footnotes
  md.use(taskList, { enabled: true }); // checkboxes
  md.use(wikilinkPlugin);             // [[wikilinks]] (must be before linkify)
  md.use(tagPlugin);                  // #tags
  md.use(embedPlugin);                // ![[embeds]]
  md.use(calloutPlugin);              // > [!TYPE] callouts

  // 2. Code block interceptors (render phase)
  md.use(chartPlugin);                // ```plotly, ```chartjs
  md.use(mermaidPlugin);              // ```mermaid

  // 3. Math rendering (post-process)
  // KaTeX runs as a post-render pass on the HTML output,
  // replacing $...$ and $$...$$ with rendered math.
  // This avoids conflicts with markdown-it's inline parsing.

  return md;
}
```

### 6.2 Math Rendering Strategy

KaTeX is applied after markdown-it renders HTML, not as a markdown-it plugin. This avoids conflicts with dollar signs in code blocks and inline code.

```typescript
import katex from "katex";

export function renderMath(html: string): string {
  // Block math: $$...$$ (must come before inline to avoid conflicts)
  html = html.replace(/\$\$([^$]+?)\$\$/g, (_, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<span class="math-error">${tex}</span>`;
    }
  });

  // Inline math: $...$
  // Negative lookbehind for \ (escaped dollar) and code blocks
  html = html.replace(/(?<![\\`])\$([^$\n]+?)\$/g, (_, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `<span class="math-error">${tex}</span>`;
    }
  });

  return html;
}
```

### 6.3 Wikilink Plugin Pattern

```typescript
// Parses [[Note Name]], [[Note#Heading]], [[Note|Alias]]
// Outputs <a class="wikilink" data-target="Note Name" data-heading="Heading">Alias</a>

export function wikilinkPlugin(md: MarkdownIt): void {
  // Add inline rule
  md.inline.ruler.after("link", "wikilink", (state, silent) => {
    const src = state.src.slice(state.pos);

    // Check for [[ opening
    if (src[0] !== "[" || src[1] !== "[") return false;

    // Check for ![[  (embed, handled by embed plugin)
    if (state.pos > 0 && state.src[state.pos - 1] === "!") return false;

    // Find closing ]]
    const closeIdx = src.indexOf("]]", 2);
    if (closeIdx === -1) return false;

    if (!silent) {
      const inner = src.slice(2, closeIdx);

      // Parse: target#heading|alias
      let target = inner;
      let heading = "";
      let alias = "";

      if (inner.includes("|")) {
        [target, alias] = inner.split("|", 2);
      }
      if (target.includes("#")) {
        [target, heading] = target.split("#", 2);
      }

      const token = state.push("wikilink", "a", 0);
      token.meta = { target: target.trim(), heading: heading.trim(), alias: alias.trim() };
    }

    state.pos += closeIdx + 2;
    return true;
  });

  // Render rule
  md.renderer.rules.wikilink = (tokens, idx) => {
    const { target, heading, alias } = tokens[idx].meta;
    const display = alias || (heading ? `${target} > ${heading}` : target);
    const dataAttrs = `data-target="${target}" ${heading ? `data-heading="${heading}"` : ""}`;
    return `<a class="wikilink" href="#" ${dataAttrs}>${display}</a>`;
  };
}
```

### 6.4 Code Block Rendering

Regular code blocks get syntax highlighting via highlight.js. Special language tags (`plotly`, `chartjs`, `mermaid`) get intercepted and rendered as interactive elements.

```typescript
import hljs from "highlight.js/lib/core";

// Register only the languages you need (tree-shaking)
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import latex from "highlight.js/lib/languages/latex";
import r from "highlight.js/lib/languages/r";
import julia from "highlight.js/lib/languages/julia";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import markdown from "highlight.js/lib/languages/markdown";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";

hljs.registerLanguage("python", python);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("latex", latex);
hljs.registerLanguage("r", r);
hljs.registerLanguage("julia", julia);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);

export function highlightCode(str: string, lang: string): string {
  // Special blocks handled by their own renderers
  if (["plotly", "chartjs", "mermaid", "excalidraw"].includes(lang)) {
    return ""; // intercepted by chart/mermaid plugins
  }

  if (lang && hljs.getLanguage(lang)) {
    return hljs.highlight(str, { language: lang }).value;
  }

  return hljs.highlightAuto(str).value;
}
```

### 6.5 Full Render Pipeline

```typescript
export function renderNote(rawMarkdown: string): { html: string; frontmatter: FrontMatter | null } {
  // 1. Extract frontmatter
  const { content, data: frontmatter } = grayMatter(rawMarkdown);

  // 2. Render markdown to HTML
  const md = getMarkdownRenderer(); // singleton, created once
  let html = md.render(content);

  // 3. Post-process: math rendering
  html = renderMath(html);

  // 4. Post-process: resolve image paths
  //    Convert relative paths like ![](assets/img.png) to Drive blob URLs
  html = resolveImagePaths(html, currentFolderId);

  return { html, frontmatter };
}
```

---

## 7. Google Drive Vault Structure

```
Google Drive/
  Sanctum/                               <- vault root (user picks this folder)
    .vault/                              <- app config, hidden from file tree UI
      config.json                        <- user preferences
      search-index.json                  <- serialized MiniSearch index
    01 - Foundations/
      Quantum Probability Basics.md
      Hilbert Space Finance.md
      assets/                            <- attachments for this section
        density-matrix.png
        bloch-sphere.svg
    02 - Stochastic Calculus/
      Ito Calculus.md
      Brownian Motion.md
      assets/
        wiener-process.png
    03 - Quantum Models/
      Quantum Black-Scholes.md
    04 - Portfolio Theory/
      Modern Portfolio Theory.md
      Efficient Frontier.md
    05 - Options and Derivatives/
      Black-Scholes Derivation.md
      Greeks Explained.md
    06 - Code and Data/
      Python Snippets.md
    07 - Reading Notes/
      Papers/
        Accardi-2024.md
      Books/
        Hull-Options.md
    assets/                              <- global shared attachments
      logo.png
    templates/                           <- note templates (optional)
      concept-note.md
      paper-review.md
      problem-set.md
```

### Folder Rules

- Each folder can have a local `assets/` subfolder for its attachments.
- A global `assets/` at the vault root holds shared media.
- `.vault/` stores app configuration only. Created automatically on first run. Hidden from the sidebar file tree.
- `templates/` holds reusable note templates (optional). Shown in "New Note" dialog.
- Folder and file naming is freeform. Numeric prefixes are optional for ordering.
- Nesting depth is unlimited but practically keep it under 4 levels.
- Non-markdown files (images, PDFs, etc.) are tracked in the tree but shown only in `assets/` contexts, not mixed with notes.

### config.json Schema

```json
{
  "version": 1,
  "theme": "dark",
  "sidebarWidth": 280,
  "editorFontSize": 16,
  "readerFontSize": 18,
  "fontFamily": "Inter",
  "codeFontFamily": "JetBrains Mono",
  "defaultReadMode": true,
  "autoSaveDelayMs": 3000,
  "recentFiles": ["file-id-1", "file-id-2"],
  "starredFiles": ["file-id-3"],
  "expandedFolders": ["folder-id-1", "folder-id-2"],
  "customCallouts": {
    "FORMULA": { "icon": "sigma", "color": "#a855f7" },
    "DEFINITION": { "icon": "book-open", "color": "#3b82f6" },
    "PROOF": { "icon": "check-square", "color": "#6b7280" }
  }
}
```

---

## 8. Note File Format

Every note is a standard markdown file with optional YAML frontmatter:

```markdown
---
title: Quantum Probability Basics
tags: [quantum, probability, foundations]
created: 2026-01-15
modified: 2026-03-19
status: in-progress
difficulty: intermediate
source: "Accardi, Quantum Probability (2024)"
related: ["[[Hilbert Space Finance]]", "[[Ito Calculus]]"]
---

# Quantum Probability Basics

Content here. Standard markdown with extensions:

- LaTeX: $E = mc^2$ and $$\int_0^\infty f(x) dx$$
- Wikilinks: [[Other Note]] or [[Note#Heading|alias]]
- Tags: #quantum #finance
- Callouts: > [!NOTE] Important info
- Code blocks with syntax highlighting
- Charts via ```plotly or ```chartjs blocks
- Diagrams via ```mermaid blocks
- Embeds: ![[Another Note]] or ![[image.png]]
```

### Frontmatter Properties

| Property | Type | Required | Purpose |
|----------|------|----------|---------|
| title | string | No | Display name (defaults to filename) |
| tags | string[] | No | Categorization, filterable |
| created | date | No | Auto-set on creation |
| modified | date | No | Auto-updated on save |
| status | string | No | draft / in-progress / complete / review |
| difficulty | string | No | beginner / intermediate / advanced |
| source | string | No | Book, paper, or URL |
| related | string[] | No | Manual cross-references |
| (any custom key) | any | No | User-defined, shown in properties panel |

---

## 9. Content Type Support

### Tier 1: Core (Phase 1)

| Content Type | Syntax | Library |
|-------------|--------|---------|
| Headings H1-H6 | `#` to `######` | markdown-it |
| Bold, italic, strikethrough | `**` `*` `~~` | markdown-it |
| Highlights | `==text==` | markdown-it-mark |
| Blockquotes | `>` | markdown-it |
| Ordered/unordered lists | `1.` / `-` | markdown-it |
| Task checkboxes | `- [ ]` / `- [x]` | markdown-it-task-lists |
| Tables | pipe syntax | markdown-it |
| Inline/block code | backticks / triple backticks | highlight.js |
| Inline/block LaTeX | `$...$` / `$$...$$` | KaTeX |
| Images (vault + external) | `![](path)` | Custom resolver + img tag |
| Wikilinks | `[[Note]]` `[[Note#H]]` `[[Note\|alias]]` | Custom plugin |
| External links | `[text](url)` | markdown-it |
| Horizontal rules | `---` | markdown-it |
| YAML frontmatter | `--- ... ---` | gray-matter |
| Footnotes | `[^1]` | markdown-it-footnote |
| Callouts | `> [!TYPE]` | Custom plugin |
| Inline tags | `#tag` | Custom plugin |

### Tier 2: Enhanced (Phase 2-3)

| Content Type | Syntax | Library | Load |
|-------------|--------|---------|------|
| Mermaid diagrams | ` ```mermaid ` | Mermaid.js | Lazy |
| Plotly charts | ` ```plotly ` | Plotly.js | Lazy |
| Chart.js charts | ` ```chartjs ` | Chart.js | Bundled |
| YouTube embeds | `![](https://youtube.com/...)` | iframe | Bundled |
| Audio playback | `![](assets/audio.mp3)` | HTML5 audio | Bundled |
| PDF inline view | `![](assets/doc.pdf)` | pdf.js or iframe | Lazy |
| Note transclusion | `![[Other Note]]` | Recursive renderer | Bundled |
| Block references | `[[Note^block-id]]` | Custom indexer | Bundled |

### Tier 3: Advanced (Phase 4+)

| Content Type | Syntax | Library | Load |
|-------------|--------|---------|------|
| Excalidraw drawings | ` ```excalidraw ` | Excalidraw React | Lazy |
| HTML widgets | ` ```html-widget ` | Sandboxed iframe | Lazy |
| Mind maps | ` ```mindmap ` | Mermaid.js v10+ | Lazy |
| Chemical formulas | `$\ce{H2O}$` | KaTeX mhchem | Bundled |

### Media Handling

**Images**: stored in `assets/` folders. Referenced as `![](assets/img.png)`. The app resolves relative paths by looking up the file by name in the current folder's `assets/` subfolder (or global `assets/`), fetching it via Drive API, and creating a blob URL. External URLs (`https://...`) load directly.

**Clipboard paste**: intercept paste event in editor. If clipboard contains an image, upload to the nearest `assets/` folder via Drive API, insert `![](assets/timestamp-name.png)` at cursor.

**Drag and drop**: same as paste but from drop event.

---

## 10. Chart System

Charts are defined as JSON inside fenced code blocks. The renderer detects the language tag and passes the JSON to the appropriate library.

### Plotly (scientific/financial)

Lazy-loaded (~1MB). Used for: candlestick/OHLC, 3D surfaces, contour plots, heatmaps, statistical charts.

Example in a note:

````
```plotly
{
  "data": [{
    "type": "candlestick",
    "x": ["2026-01-01", "2026-01-02", "2026-01-03"],
    "open": [33.0, 33.3, 33.5],
    "high": [33.1, 33.5, 33.8],
    "low": [32.7, 33.1, 33.2],
    "close": [33.0, 33.5, 33.3]
  }],
  "layout": {
    "title": "Price Action",
    "template": "plotly_dark"
  }
}
```
````

**Rendering flow**:
1. Chart plugin intercepts `plotly` code block during markdown-it render
2. Outputs a placeholder `<div class="chart-plotly" data-chart='...json...'></div>`
3. After HTML is inserted into DOM, a React effect scans for `.chart-plotly` divs
4. For each, dynamically imports Plotly.js (`import("plotly.js-dist-min")`)
5. Calls `Plotly.newPlot(div, data, layout)` with the parsed JSON
6. Charts are interactive: zoom, pan, hover tooltips all work

**Plotly chart types relevant to finance/quantum:**

| Type | Use Case |
|------|----------|
| scatter (lines) | Price series, yield curves, moving averages |
| scatter (markers) | Risk vs return, asset comparison |
| candlestick | OHLC price data |
| histogram | Return distributions, probability densities |
| heatmap | Correlation matrices, density matrices |
| contour | Wigner functions, 2D probability |
| surface (3D) | Volatility surfaces, efficient frontiers |
| scatter3d | Bloch sphere, 3D point clouds |
| bar | Portfolio weights, comparisons |
| box / violin | Statistical summaries |
| waterfall | P&L attribution |
| indicator | Single metrics (Sharpe, VaR) |

### Chart.js (lightweight 2D)

Bundled (~60KB). Used for: quick line/bar/pie/scatter when Plotly is overkill.

````
```chartjs
{
  "type": "line",
  "data": {
    "labels": ["Jan", "Feb", "Mar", "Apr"],
    "datasets": [{
      "label": "NAV",
      "data": [100, 105, 102, 110],
      "borderColor": "#7c3aed"
    }]
  }
}
```
````

### Lazy Loading Strategy

```typescript
// chart-setup.ts
let plotlyPromise: Promise<any> | null = null;

export async function getPlotly() {
  if (!plotlyPromise) {
    plotlyPromise = import("plotly.js-dist-min");
  }
  return plotlyPromise;
}

// Called after markdown HTML is inserted into DOM
export async function renderCharts(container: HTMLElement) {
  const plotlyDivs = container.querySelectorAll(".chart-plotly");
  if (plotlyDivs.length > 0) {
    const Plotly = await getPlotly();
    plotlyDivs.forEach((div) => {
      const config = JSON.parse(div.getAttribute("data-chart")!);
      Plotly.newPlot(div, config.data, {
        ...config.layout,
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "var(--text-primary)" },
      });
    });
  }
}
```

---

## 11. Search System

### Full-Text Search

On vault load, the app fetches content of all `.md` files and builds a MiniSearch index.

```typescript
import MiniSearch from "minisearch";

const searchIndex = new MiniSearch({
  fields: ["title", "content", "tags"],    // fields to index
  storeFields: ["title", "path", "tags"],  // fields to return in results
  searchOptions: {
    boost: { title: 3, tags: 2 },          // title matches rank higher
    fuzzy: 0.2,                            // allow typos
    prefix: true,                          // match prefixes
  },
});

// Build index from all vault files
async function buildSearchIndex(files: VaultFile[], drive: DriveService) {
  const docs = await Promise.all(
    files.map(async (f) => {
      const raw = await drive.readFile(f.id);
      const { content, data } = grayMatter(raw);
      return {
        id: f.id,
        title: data.title || f.name.replace(".md", ""),
        content: content,
        tags: (data.tags || []).join(" "),
        path: f.path,
      };
    })
  );

  searchIndex.addAll(docs);

  // Cache the index for faster subsequent loads
  await cacheService.set("search-index", JSON.stringify(searchIndex.toJSON()));
}
```

### Incremental Updates

When a note is saved, update only that entry in the index:

```typescript
function updateSearchEntry(fileId: string, raw: string, fileName: string) {
  searchIndex.discard(fileId);
  const { content, data } = grayMatter(raw);
  searchIndex.add({
    id: fileId,
    title: data.title || fileName.replace(".md", ""),
    content,
    tags: (data.tags || []).join(" "),
  });
}
```

### Quick Switcher

Separate from full-text search. Uses the file tree in memory for instant fuzzy filename matching. Triggered by Ctrl+O.

```typescript
// Simple fuzzy match for filenames
function fuzzyMatch(query: string, filename: string): number {
  const q = query.toLowerCase();
  const f = filename.toLowerCase();
  let score = 0;
  let qi = 0;
  for (let fi = 0; fi < f.length && qi < q.length; fi++) {
    if (f[fi] === q[qi]) {
      score += (fi === 0 || f[fi - 1] === " " || f[fi - 1] === "-") ? 2 : 1;
      qi++;
    }
  }
  return qi === q.length ? score : 0; // 0 = no match
}
```

---

## 12. Offline and Caching

### IndexedDB Cache (via `idb` library)

```typescript
// cache.service.ts
import { openDB } from "idb";

const DB_NAME = "sanctum-cache";
const DB_VERSION = 1;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore("files");       // note content cache
    db.createObjectStore("tree");        // file tree cache
    db.createObjectStore("blobs");       // image/attachment cache
    db.createObjectStore("meta");        // search index, config
  },
});

export const cacheService = {
  async get(store: string, key: string) {
    return (await dbPromise).get(store, key);
  },
  async set(store: string, key: string, value: any) {
    return (await dbPromise).put(store, value, key);
  },
  async delete(store: string, key: string) {
    return (await dbPromise).delete(store, key);
  },
  async clear(store: string) {
    return (await dbPromise).clear(store);
  },
};
```

### Caching Strategy

| Data | Store | Eviction | Purpose |
|------|-------|----------|---------|
| File tree | `tree` | Replaced on refresh | Instant sidebar render on reload |
| Recent 50 notes | `files` | LRU by access time | Offline reading of recent notes |
| Images in recent notes | `blobs` | LRU, max 100MB | Offline image display |
| Search index | `meta` | Replaced on rebuild | Fast search without re-indexing |
| User config | `meta` | Manual only | Theme, preferences, recent files |

### Service Worker (PWA)

Using `vite-plugin-pwa` with Workbox:

```typescript
// vite.config.ts
import { VitePWA } from "vite-plugin-pwa";

export default {
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/,
            handler: "CacheFirst",  // CDN assets (KaTeX, Plotly, etc.)
            options: { cacheName: "cdn-cache", expiration: { maxEntries: 50 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "font-cache" },
          },
        ],
      },
      manifest: {
        name: "Sanctum",
        short_name: "Sanctum",
        description: "Private markdown vault",
        theme_color: "#1e1e2e",
        background_color: "#1e1e2e",
        display: "standalone",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
};
```

---

## 13. Import and Export

### Import

| Source | Library | Method |
|--------|---------|--------|
| Word .docx | mammoth.js | Convert to markdown, save as .md to Drive |
| PDF (text extract) | pdf.js | Best-effort text extraction, save as .md |
| PDF (as attachment) | File upload | Store in assets/, embed link in note |
| Images | Clipboard/drag-drop | Upload to assets/, insert markdown link |
| HTML (web clip) | turndown.js | Convert to markdown, save as .md |
| Obsidian vault | Direct copy | Already .md files, copy folder to Drive |
| CSV data | Custom parser | Convert to markdown table or chart JSON |

### Export

| Target | Library | Method |
|--------|---------|--------|
| PDF | html2pdf.js | Render note HTML with print stylesheet |
| HTML | Built-in | Save rendered HTML as standalone file |
| Markdown | Native | Download the .md file directly |
| Full vault ZIP | JSZip | Bundle all files, download as .zip |

### PDF Export Detail

```typescript
import html2pdf from "html2pdf.js";

async function exportToPDF(html: string, title: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.className = "pdf-export"; // uses print.css styles

  await html2pdf()
    .set({
      margin: [15, 15, 15, 15],
      filename: `${title}.pdf`,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    })
    .from(container)
    .save();
}
```

---

## 14. UI Design

### Theme System

CSS variables drive the entire theme. Toggling theme = swapping variable values on `:root`.

```css
/* globals.css */
:root[data-theme="dark"] {
  --bg-primary: #1e1e2e;
  --bg-secondary: #181825;
  --bg-tertiary: #313244;
  --bg-code: #11111b;
  --text-primary: #cdd6f4;
  --text-secondary: #a6adc8;
  --text-muted: #585b70;
  --accent-link: #89b4fa;
  --accent-tag: #cba6f7;
  --accent-heading: #f5c2e7;
  --accent-highlight: #f9e2af;
  --border: #313244;
  --success: #a6e3a1;
  --warning: #fab387;
  --error: #f38ba8;
  --scrollbar-thumb: #45475a;
  --scrollbar-track: transparent;
}

:root[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #e8e8e8;
  --bg-code: #f0f0f0;
  --text-primary: #1e1e2e;
  --text-secondary: #4c4f69;
  --text-muted: #9ca0b0;
  --accent-link: #2563eb;
  --accent-tag: #7c3aed;
  --accent-heading: #1e1e2e;
  --accent-highlight: #fbbf24;
  --border: #e0e0e0;
  --success: #16a34a;
  --warning: #ea580c;
  --error: #dc2626;
  --scrollbar-thumb: #c0c0c0;
  --scrollbar-track: transparent;
}
```

### Typography

```css
/* markdown.css */
.markdown-body {
  font-family: "Inter", "Source Sans 3", system-ui, sans-serif;
  font-size: var(--reader-font-size, 18px);
  line-height: 1.75;
  color: var(--text-primary);
}

.markdown-body code,
.markdown-body pre {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 0.875em;
}

.markdown-body h1 { font-size: 2em; color: var(--accent-heading); margin-top: 2em; }
.markdown-body h2 { font-size: 1.5em; color: var(--accent-heading); margin-top: 1.5em; }
.markdown-body h3 { font-size: 1.25em; color: var(--text-primary); margin-top: 1.25em; }

.markdown-body blockquote {
  border-left: 3px solid var(--accent-link);
  padding-left: 1em;
  color: var(--text-secondary);
}

.markdown-body mark {
  background: var(--accent-highlight);
  color: #1e1e2e;
  padding: 0.1em 0.3em;
  border-radius: 3px;
}
```

### Desktop Layout

```
+------------------------------------------------------------------+
| [=] Sanctum                      [Ctrl+O] [theme] [gear] [user] |
+------------------------------------------------------------------+
|          |  [tab1.md] [tab2.md] [+]                               |
| SIDEBAR  |-------------------------------------------------------|
| 280px    |  Properties: title, tags, status              [^/v]   |
| resize-  |-------------------------------------------------------|
| able     |                                                        |
|          |  # Note Title                          [Read] [Edit]  |
| [search] |                                                        |
|          |  Content renders here with full                        |
| VAULT    |  markdown, math, code, charts,                        |
| v folder |  diagrams, images, callouts...                        |
|   file   |                                                        |
|   file   |  $$\int_0^\infty f(x) dx$$                            |
| v folder |                                                        |
|   file   |  ```python                                             |
|          |  import numpy as np                                    |
| -------- |  ```                                                   |
| TAGS     |                                                        |
| #quantum |  > [!FORMULA] Key Equation                             |
| #proof   |  > Content here                                        |
|          |                                                        |
| -------- |  [interactive plotly chart]                             |
| BACK-    |                                                        |
| LINKS    |-------------------------------------------------------|
| 3 notes  |  Table of Contents                    [expand/collapse]|
| link here|  Backlinks: Note A, Note B                             |
+----------+-------------------------------------------------------+
```

### Mobile Layout

```
+----------------------------------+
| [=] Sanctum           [RO] [Q]  |
+----------------------------------+
| Props: tags, status         [^]  |
+----------------------------------+
|                                  |
| # Note Title                     |
|                                  |
| Full rendered content            |
| with math, code, charts          |
| all responsive                   |
|                                  |
+----------------------------------+

- Sidebar: slides in from left on hamburger tap or right-edge swipe
- Backlinks / TOC: bottom sheet, swipe up
- Quick switcher: full-screen modal on [Q] tap
- Editor: full-screen CodeMirror when in edit mode
```

### Callout Styling

| Type | Icon (lucide) | Border Color |
|------|--------------|-------------|
| NOTE | `info` | `#89b4fa` |
| TIP | `lightbulb` | `#a6e3a1` |
| WARNING | `triangle-alert` | `#fab387` |
| DANGER | `zap` | `#f38ba8` |
| IMPORTANT | `flame` | `#cba6f7` |
| QUESTION | `help-circle` | `#f9e2af` |
| EXAMPLE | `list` | `#94e2d5` |
| QUOTE | `quote` | `#a6adc8` |
| SUCCESS | `check-circle` | `#a6e3a1` |
| ABSTRACT | `clipboard` | `#89dceb` |
| TODO | `square-check` | `#fab387` |
| FORMULA | `sigma` | `#cba6f7` |
| DEFINITION | `book-open` | `#89b4fa` |
| PROOF | `check-square` | `#a6adc8` |

---

## 15. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` / `Cmd+O` | Quick switcher (fuzzy file search) |
| `Ctrl+P` / `Cmd+P` | Command palette |
| `Ctrl+S` / `Cmd+S` | Save current note |
| `Ctrl+E` / `Cmd+E` | Toggle read/edit mode |
| `Ctrl+\` | Toggle sidebar |
| `Ctrl+Shift+F` | Search across vault |
| `Ctrl+N` | New note |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Escape` | Close modal/switcher |

---

## 16. Routing

Hash-based routing via React Router. Hash mode ensures GitHub Pages (or any static host) serves `index.html` for all paths without server config.

```
#/login                              Login page
#/vault                              Vault root (file tree, no note selected)
#/vault/note/:fileId                 Viewing/editing a specific note
#/vault/note/:fileId#heading-slug    Note scrolled to heading
#/settings                           User preferences
```

Example: `https://yourusername.github.io/sanctum/#/vault/note/abc123def`

**Navigation within the app:**
- Clicking a file in the sidebar navigates to `#/vault/note/:fileId`
- Clicking a wikilink resolves the note name to a file ID (via the file tree in Zustand), then navigates
- Back/forward browser buttons work naturally with hash routing

---

## 17. Wikilink Resolution

When the user clicks a `[[wikilink]]`, the app needs to find the corresponding file in Drive.

```typescript
function resolveWikilink(target: string, fileTree: FileTreeNode[]): string | null {
  // Flatten tree to a list of all .md files
  const allFiles = flattenTree(fileTree).filter(n => n.type === "file");

  // 1. Exact match (without .md extension)
  const exact = allFiles.find(f => f.name === `${target}.md`);
  if (exact) return exact.id;

  // 2. Case-insensitive match
  const caseInsensitive = allFiles.find(
    f => f.name.toLowerCase() === `${target.toLowerCase()}.md`
  );
  if (caseInsensitive) return caseInsensitive.id;

  // 3. Partial match (target is a suffix of the path)
  //    e.g., [[Brownian Motion]] matches "02 - Stochastic Calculus/Brownian Motion.md"
  const partial = allFiles.find(f => f.name.toLowerCase().startsWith(target.toLowerCase()));
  if (partial) return partial.id;

  // 4. No match found: ghost link
  return null;
}
```

Ghost links (unresolved) are rendered with a distinct style (dimmed, dotted underline). Clicking a ghost link offers to create a new note with that name.

---

## 18. Backlinks

For the active note, scan all other notes to find which ones contain a `[[link]]` to it.

**Strategy**: on vault load (or incrementally), build a backlink map:

```typescript
// Build once, update incrementally on save
type BacklinkMap = Map<string, string[]>; // noteId -> [noteIds that link to it]

async function buildBacklinkMap(allFiles: VaultFile[], drive: DriveService): Promise<BacklinkMap> {
  const map = new Map<string, string[]>();
  const wikilinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]*)?(|[^\]]*)?]]/g;

  for (const file of allFiles) {
    const content = await drive.readFile(file.id);
    let match;
    while ((match = wikilinkRegex.exec(content)) !== null) {
      const target = match[1].trim();
      const targetId = resolveWikilink(target, fileTree);
      if (targetId) {
        const existing = map.get(targetId) || [];
        existing.push(file.id);
        map.set(targetId, existing);
      }
    }
  }

  return map;
}
```

**Performance**: this requires reading all files on first load. For vaults under 500 notes, this is acceptable (500 small API calls). For larger vaults, do it lazily or run in a web worker. Cache the backlink map in IndexedDB.

---

## 19. Google Cloud Project Setup

One-time, free, takes 10 minutes:

1. Go to `console.cloud.google.com`
2. Create project: "Sanctum"
3. APIs & Services > Enable APIs > Search "Google Drive API" > Enable
4. APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID
5. Application type: "Web application"
6. Name: "Sanctum Web Client"
7. Authorized JavaScript origins: `https://yourusername.github.io`
8. Authorized redirect URIs: `https://yourusername.github.io/sanctum/`
9. Copy the Client ID (looks like: `123456789-abcdef.apps.googleusercontent.com`)
10. Create `.env` file: `VITE_GOOGLE_CLIENT_ID=your-client-id-here`
11. OAuth consent screen: set to "External", add your email as test user
12. No billing account needed. Free tier covers personal Drive API usage.

**Scope**: request only `https://www.googleapis.com/auth/drive.file`. This limits the app to files it created or the user explicitly opened with it. The app cannot see or access any other files in your Drive.

---

## 20. Development Phases

### Phase 1: Read-Only Vault (target: 2-3 weeks)

Must-haves:
- Google OAuth2 PKCE sign-in
- Vault folder selection (first-run picker)
- Recursive folder tree in sidebar
- Click file to load and render markdown
- Full markdown rendering pipeline (all Tier 1 content types)
- KaTeX math rendering
- Code block syntax highlighting
- YAML frontmatter properties panel
- Callout/admonition rendering
- Image loading from Drive
- Wikilink rendering and navigation
- Dark theme (Catppuccin Mocha-inspired)
- Responsive layout (usable on mobile)
- PWA manifest (installable)

### Phase 2: Edit and Write (target: 1-2 weeks)

- Read/edit toggle
- CodeMirror 6 editor with markdown highlighting
- Auto-save (debounced, 3s after last keystroke)
- Manual save on Ctrl+S
- Create new note (blank or from template)
- Create folder
- Rename files and folders
- Delete (move to Drive trash) with confirmation
- Image paste from clipboard (auto-upload)
- Drag-and-drop file upload
- Frontmatter editing in properties panel

### Phase 3: Power Features (target: 2-3 weeks)

- Full-text search (MiniSearch)
- Quick switcher (Ctrl+O)
- Tag browser in sidebar
- Backlinks panel
- Table of contents (auto-generated)
- Mermaid diagram rendering (lazy)
- Plotly chart rendering (lazy)
- Chart.js chart rendering
- YouTube/Vimeo embed detection
- Audio playback
- PDF inline viewing
- PDF export
- Note transclusion (`![[Note]]`)
- Tab bar (multiple open notes)

### Phase 4: Polish (ongoing)

- Offline mode (service worker + IndexedDB)
- Docx import
- HTML web clipping
- Full vault ZIP backup
- Block references
- Command palette (Ctrl+P)
- Keyboard shortcuts (all)
- Split pane view
- Mobile swipe gestures
- Light theme
- Breadcrumb navigation
- Starred/favorite notes
- Recent files list

---

## 21. Dependencies

```json
{
  "name": "sanctum",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "deploy": "vite build && gh-pages -d dist"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "zustand": "^4.5.0",

    "markdown-it": "^14.0.0",
    "markdown-it-mark": "^4.0.0",
    "markdown-it-footnote": "^4.0.0",
    "markdown-it-task-lists": "^2.1.0",
    "gray-matter": "^4.0.3",

    "katex": "^0.16.0",
    "highlight.js": "^11.10.0",
    "minisearch": "^7.0.0",

    "codemirror": "^6.0.0",
    "@codemirror/lang-markdown": "^6.0.0",
    "@codemirror/theme-one-dark": "^6.0.0",

    "idb": "^8.0.0",
    "lucide-react": "^0.383.0",

    "html2pdf.js": "^0.10.1",
    "mammoth": "^1.8.0",
    "turndown": "^7.2.0",
    "jszip": "^3.10.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^6.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite-plugin-pwa": "^0.20.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "gh-pages": "^6.2.0"
  }
}
```

**Lazy-loaded (not in package.json, loaded from CDN):**
- `plotly.js-dist-min` (~1MB) loaded on first `plotly` code block
- `mermaid` (~200KB) loaded on first `mermaid` code block

---

## 22. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Drive API rate limits (slow browsing for large vaults) | Batch-fetch all files in one API call, build tree client-side. Cache tree in IndexedDB. |
| Token expiry mid-edit | Auto-save before refresh attempt. Silent refresh via iframe. Warn user on failure. |
| Large vault (1000+ files) | Single flat `files.list` query instead of recursive folder traversal. Paginate. Lazy-load file content. |
| Plotly bundle size (1MB) | Lazy-load from CDN on first use. Cache in service worker. |
| IndexedDB storage limits | LRU eviction (keep 50 most recent notes). Warn user at 80% capacity. |
| Google Drive API changes | Abstract all Drive calls behind DriveService. Pin to API v3. |
| iOS PWA limitations | Accept: no background sync, limited IndexedDB. Focus on online-first. |
| KaTeX missing packages | Fall back to rendering raw LaTeX in a styled span with error indicator. |
| Concurrent edits (two devices) | Last-write-wins for v1. Future: diff-merge on conflict. |
| Image loading speed | Generate blob URLs on first load, cache in IndexedDB. Show loading skeleton. |

---

## 23. Explicitly Out of Scope

- Graph view (network visualization of links)
- Obsidian plugin compatibility
- Canvas/whiteboard
- Dataview queries
- Multi-user collaboration
- End-to-end encryption (possible future addition)
- Native mobile app (PWA is sufficient)
- Git-based version history
- AI integration (would require API key, not free)

---

## 24. Setup Checklist

Before writing any code:

1. [ ] Create Google Cloud project and OAuth2 credentials
2. [ ] Create GitHub repo: `sanctum`
3. [ ] Initialize Vite + React + TypeScript project
4. [ ] Install dependencies from package.json above
5. [ ] Set up Tailwind CSS
6. [ ] Configure PWA plugin in vite.config.ts
7. [ ] Create `.env` with `VITE_GOOGLE_CLIENT_ID`
8. [ ] Create folder structure as defined in section 3
9. [ ] Set up GitHub Pages deployment
10. [ ] Create the Sanctum vault folder in Google Drive with sample notes
11. [ ] Begin Phase 1 implementation
