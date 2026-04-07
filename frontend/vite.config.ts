import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',

  server: {
    headers: {
      // Allow Firebase Auth popup to communicate back to the opener
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },

  build: {
    outDir: 'dist',
    // Source maps for production debugging (uploaded to error-tracking tools,
    // not exposed to users — Vercel serves only .js/.css, not .map files).
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split Firebase into its own chunk so the main bundle stays small
        manualChunks: (id) => {
          if (
            id.includes('firebase/app') ||
            id.includes('firebase/firestore') ||
            id.includes('firebase/auth') ||
            id.includes('firebase/messaging') ||
            id.includes('firebase/storage')
          ) {
            return 'firebase';
          }
        },
      },
    },
  },

  plugins: [
    react(),
    VitePWA({
      // injectManifest lets us write a full custom SW (required for FCM push
      // events and notificationclick — generateSW cannot inject those).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',

      // We register the SW manually in main.tsx so we can show an update banner.
      injectRegister: false,

      manifest: {
        name: '꼬마발자국',
        short_name: '꼬마발자국',
        description: '육아 인플루언서 공구 일정 알림 앱',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#1A56A0',
        lang: 'ko',
        categories: ['lifestyle', 'shopping'],
        icons: [
          {
            src: '/icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      injectManifest: {
        // Inject precache entries for all build artifacts into self.__WB_MANIFEST
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },

      devOptions: {
        // SW is disabled in dev — injectManifest strategy requires a build step.
        // Test SW/push features with: npm run build && npm run preview
        enabled: false,
        suppressWarnings: true,
      },
    }),
  ],
});