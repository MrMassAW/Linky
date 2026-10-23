import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createReadStream, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

// Self-host the MediaPipe WASM runtime at /mediapipe/ (served from node_modules in dev,
// emitted into dist on build) so the face check needs no third-party CDN.
function mediapipeWasm(): Plugin {
  const dir = join(dirname(createRequire(import.meta.url).resolve('@mediapipe/tasks-vision')), 'wasm');
  const files = readdirSync(dir).filter((f) => f.startsWith('vision_wasm_internal') || f.startsWith('vision_wasm_nosimd_internal'));
  return {
    name: 'linky-mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use('/mediapipe', (req, res, next) => {
        const file = files.find((f) => req.url === `/${f}`);
        if (!file) return next();
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        createReadStream(join(dir, file)).pipe(res);
      });
    },
    generateBundle() {
      for (const f of files) this.emitFile({ type: 'asset', fileName: `mediapipe/${f}`, source: readFileSync(join(dir, f)) });
    },
  };
}

export default defineConfig({
  plugins: [
    mediapipeWasm(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Linky',
        short_name: 'Linky',
        description: 'Real connections between verified humans.',
        theme_color: '#e8505b',
        background_color: '#fff7f3',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell offline; ML models are fetched from CDNs at runtime and cached on use.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // ML code/weights (TensorFlow.js, NSFW model, MediaPipe) load on demand and are
        // cached at runtime instead of bloating the install.
        globIgnores: ['**/mediapipe/**', '**/group1-shard*', '**/model.min-*', '**/dist-*', '**/vision_bundle-*', '**/nsfw*', '**/tfjs*'],
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
