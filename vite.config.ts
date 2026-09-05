/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';

// GITHUB_REPO lets CI set the base path for project Pages (/<repo>/).
const base = process.env.VITE_BASE ?? '/';

/** Emit the service worker with a per-build cache name so each deploy replaces the old shell. */
function serviceWorker(): Plugin {
  return {
    name: 'panelist-sw',
    apply: 'build',
    generateBundle() {
      const source = readFileSync(resolve('src/pwa/sw.js'), 'utf8').replaceAll('__BUILD__', Date.now().toString(36));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), serviceWorker()],
  server: {
    proxy: {
      '/api': { target: process.env.API_ORIGIN ?? 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('/docx/')) return 'docx';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
