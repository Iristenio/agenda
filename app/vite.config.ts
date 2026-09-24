import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// No GitHub Pages o app fica em https://<usuario>.github.io/agenda/
const BASE = process.env.BASE_PATH ?? '/agenda/';

export default defineConfig({
  base: BASE,
  define: {
    __VERSAO__: JSON.stringify(`${process.env.npm_package_version} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Agenda',
        short_name: 'Agenda',
        description: 'Agenda pessoal: compromissos, tarefas e eventos',
        lang: 'pt-BR',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f7f9',
        theme_color: '#2f6fed',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${BASE}index.html`,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
