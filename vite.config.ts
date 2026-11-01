import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { renderServiceWorker, STATIC_ASSETS } from './src/pwa/sw-template.js';

/**
 * Emits `sw.js` with a precache list computed from the actual build output.
 *
 * Vite fingerprints every asset, so a static list in `public/` would point at
 * files that no longer exist after the first content change. Building the worker
 * here keeps the manifest and the bundle in lockstep.
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'azan-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const emitted = Object.keys(bundle)
        .filter((fileName) => !fileName.endsWith('.map'))
        .map((fileName) => `/${fileName}`);
      const precache = [...new Set(['/', ...emitted, ...STATIC_ASSETS])];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: renderServiceWorker(precache),
      });
      this.warn(
        `service worker: ${precache.length} entries precached (${emitted.length} from the bundle, ${STATIC_ASSETS.length} static)`,
      );
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [serviceWorkerPlugin()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // The city catalogue is imported as JSON and is expected to be a few hundred
    // kilobytes; it is data, not a bundling mistake.
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    strictPort: false,
    watch: {
      // Source archives (MA.zip/MA.txt, ~150 MB) and the untouched audio
      // originals are inputs to generator scripts, not app sources. Watching
      // them makes Windows throw EBUSY on the zip.
      ignored: ['**/data-source/**', '**/audio-originals/**', '**/audio-cleaned/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
