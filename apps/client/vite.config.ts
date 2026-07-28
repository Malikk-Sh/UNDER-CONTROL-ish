import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const sharedSrc = fileURLToPath(new URL('../../packages/shared/src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Общий пакет подключается исходниками: у клиента и сервера гарантированно
      // одна и та же версия правил симуляции, без шага сборки между ними.
      '@uc/shared': `${sharedSrc}/index.ts`,
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
