import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Shared with the manifest's icon paths below — confirmed real, pre-existing
// bug via DevTools' Application > Manifest panel: every icon entry
// (including the original favicon.svg one, not just the new PNGs) used an
// absolute root path like `/favicon.svg`, which resolves to the domain
// root. Since the app is actually served under this base path everywhere
// (including production, GitHub Pages), that 404s outside of a coincidence
// where the site happens to be hosted at the domain root. Deriving every
// icon src from this one constant prevents the two from drifting apart
// again the way they silently already had.
const BASE = '/Sanctum/'

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // oauth-callback.html is a real standalone static page (Google
        // redirects the sign-in popup straight to it), not a React route —
        // Workbox's default NavigationRoute SPA fallback (needed so a hard
        // refresh on e.g. /vault/note/:id doesn't 404) intercepts EVERY
        // navigation with no exceptions otherwise, silently serving
        // index.html in its place. Confirmed as a real bug via testing:
        // the sign-in popup showed the full Sanctum login screen instead of
        // running the callback's postMessage-and-close logic, permanently
        // stuck. Invisible until now because the service worker has never
        // been active during any prior testing (dev server has none).
        //
        // No trailing `$` — Workbox tests this against pathname + search,
        // and Google always appends `?state=...&code=...` to this URL, so
        // an end-anchored regex never matches the real callback request
        // (confirmed as the reason the first version of this fix didn't
        // actually work).
        navigateFallbackDenylist: [/\/oauth-callback\.html/],
        // plotly.js-dist-min is ~4.6MB unminified-equivalent (far past the
        // ~1MB the master plan estimated, and past workbox's own 2MB
        // per-file precache limit, which fails the build outright without
        // this). It's already lazy-loaded via dynamic import() (useCharts.ts)
        // — excluding it from the *precache* manifest doesn't stop it from
        // working, it just stops every single user from being forced to
        // download 4.6MB on first install for a chart type most notes will
        // never use. A runtime fetch (only when an actual ```plotly block
        // is rendered) goes through the normal browser HTTP cache instead.
        globIgnores: ['**/plotly.min-*.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: 'Sanctum',
        short_name: 'Sanctum',
        description: 'Private markdown vault',
        theme_color: '#17181a',
        background_color: '#17181a',
        display: 'standalone',
        // No SVG entry — confirmed via testing that Chrome's manifest
        // processor fails to load an SVG icon here (a known, common
        // cross-browser inconsistency for SVG specifically inside the PWA
        // manifest's `icons` array, unrelated to the tab favicon, which is
        // a separate <link rel="icon"> mechanism in index.html that already
        // works fine). The PNGs below already fully cover both regular and
        // maskable install-icon needs at both required sizes, so there's no
        // reason to keep an unreliable redundant entry around.
        icons: [
          { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Separate maskable variants (not just `purpose: 'any maskable'` on
          // the same file) — a maskable icon needs its content confined to a
          // smaller safe zone so an OS-applied circular/rounded-square mask
          // doesn't clip it, which would make the regular icon look
          // needlessly zoomed-out everywhere that just wants `any`.
          { src: `${BASE}icons/icon-maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: `${BASE}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
