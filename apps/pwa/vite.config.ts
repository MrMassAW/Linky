import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createReadStream, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const pkgDir = (name: string) => fileURLToPath(new URL(`./node_modules/${name}`, import.meta.url));

// Self-host third-party runtime files (served from node_modules in dev, emitted into
// dist on build) so the face check and push service worker need no third-party CDN:
//   /mediapipe/  MediaPipe Tasks WASM runtime
//   /firebase/   Firebase compat bundles for public/firebase-messaging-sw.js
function vendorAssets(): Plugin {
  const groups = [
    {
      prefix: 'mediapipe',
      dir: join(pkgDir('@mediapipe/tasks-vision'), 'wasm'),
      match: (f: string) => /^vision_wasm_(nosimd_)?internal\.(js|wasm)$/.test(f),
    },
    {
      prefix: 'firebase',
      dir: pkgDir('firebase'),
      match: (f: string) => f === 'firebase-app-compat.js' || f === 'firebase-messaging-compat.js',
    },
  ].map((g) => ({ ...g, files: readdirSync(g.dir).filter(g.match) }));
  return {
    name: 'linky-vendor-assets',
    configureServer(server) {
      for (const g of groups) {
        server.middlewares.use(`/${g.prefix}`, (req, res, next) => {
          const file = g.files.find((f) => req.url === `/${f}`);
          if (!file) return next();
          res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
          createReadStream(join(g.dir, file)).pipe(res);
        });
      }
    },
    generateBundle() {
      for (const g of groups) {
        for (const f of g.files) this.emitFile({ type: 'asset', fileName: `${g.prefix}/${f}`, source: readFileSync(join(g.dir, f)) });
      }
    },
  };
}

// LINKY_STATIC=1 builds a self-contained demo that runs from any folder or sandboxed
// host: relative asset paths, hash routing, and no service worker.
const STATIC = Boolean(process.env.LINKY_STATIC);

export default defineConfig({
  base: STATIC ? './' : '/',
  define: {
    'import.meta.env.VITE_HASH_ROUTER': JSON.stringify(STATIC ? 'true' : ''),
    'import.meta.env.VITE_BUILD': JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  plugins: [
    vendorAssets(),
    react(),
    tailwindcss(),
    VitePWA({
      disable: STATIC,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo-mark.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Linky',
        short_name: 'Linky',
        description: 'Real connections between verified humans.',
        theme_color: '#7c6ae6',
        background_color: '#f6f7fc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell offline; ML models are fetched from CDNs at runtime and cached on use.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // ML code/weights (TensorFlow.js, NSFW model, MediaPipe) load on demand and are
        // cached at runtime instead of bloating the install.
        globIgnores: ['**/mediapipe/**', '**/firebase/**', '**/firebase-messaging-sw.js', '**/group1-shard*', '**/model.min-*', '**/dist-*', '**/vision_bundle-*', '**/nsfw*', '**/tfjs*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname.includes('jsdelivr.net') ||
              url.hostname.includes('storage.googleapis.com') ||
              /\/(mediapipe\/|assets\/(group1-shard|model\.min-|dist-|vision_bundle-))/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'ml-models', expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
  server: { host: true },
});
