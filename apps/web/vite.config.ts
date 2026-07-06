import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Dev: Vite proxies /api → gateway. Prod (docker): nginx does the same.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Monere — Finance for traders',
        short_name: 'Monere',
        description: 'Marchés, earnings et smart money en temps réel.',
        lang: 'fr',
        display: 'standalone',
        background_color: '#0B0B0F',
        theme_color: '#0B0B0F',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // API responses are real-time — never serve them from SW cache
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    // Autorise l'accès via un tunnel Cloudflare (URL publique de démo)
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.GATEWAY_PORT || 8080}`,
        changeOrigin: true,
      },
    },
  },
});
