import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/Sanctum/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
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
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
})
