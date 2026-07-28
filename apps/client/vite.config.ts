import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      strategies: 'generateSW',
      includeAssets: ['assets/*.svg'],
      manifest: {
        id: '/',
        name: 'Всё под контролем!',
        short_name: 'UNDER CONTROL-ish',
        description: 'Физическая 2D-смена: доставьте перегревающуюся батарею.',
        theme_color: '#101820',
        background_color: '#101820',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        lang: 'ru-RU',
        categories: ['games', 'entertainment'],
        icons: [
          {
            src: 'assets/app-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'assets/app-icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,json,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
