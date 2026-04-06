/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope;

// ── Precache ─────────────────────────────────────────────────────────────────
// vite-plugin-pwa injects the build manifest here at compile time.
// Covers: /, /index.html, /manifest.webmanifest, all JS/CSS/asset chunks.

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA fallback — all navigation requests serve index.html from precache
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// ── Runtime caching ───────────────────────────────────────────────────────────

// Network-First for Firestore (fresh data preferred; fall back to cache on offline)
registerRoute(
  ({ url }) => url.hostname === 'firestore.googleapis.com',
  new NetworkFirst({
    cacheName: 'firestore-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 }),
    ],
  })
);

// CacheFirst for Instagram/Facebook oEmbed (stable embeds, 24h TTL)
registerRoute(
  ({ url }) => url.hostname === 'graph.facebook.com',
  new CacheFirst({
    cacheName: 'oembed-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);

// CacheFirst for Naver CDN images used in product cards
registerRoute(
  ({ url }) => url.hostname.endsWith('.naver.net') || url.hostname.endsWith('.naver.com'),
  new CacheFirst({
    cacheName: 'naver-images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

// ── Background sync — OCR deal submissions ────────────────────────────────────
// If a POST to the OCR server fails (offline / Railway cold start), the request
// is queued and automatically retried once connectivity is restored.

const ocrSyncPlugin = new BackgroundSyncPlugin('deal-submissions', {
  maxRetentionTime: 24 * 60, // keep queued requests for up to 24 hours
});

registerRoute(
  ({ url, request }) =>
    request.method === 'POST' && url.pathname === '/ocr',
  new NetworkFirst({
    cacheName: 'ocr-responses',
    networkTimeoutSeconds: 30,
    plugins: [ocrSyncPlugin],
  }),
  'POST'
);

// ── Skip-waiting message ──────────────────────────────────────────────────────
// main.tsx posts { type: 'SKIP_WAITING' } when the user confirms the update.
// We do NOT auto-skip so the user controls when the page reloads.

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

clientsClaim();

// ── FCM / Web Push ────────────────────────────────────────────────────────────

interface PushPayload {
  title?: string;
  body?: string;
  dealId?: string;
  type?: 'alarm' | 'keyword';
}

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let payload: PushPayload = {};
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { body: event.data.text() };
  }

  const title = payload.title ?? '꼬마발자국';
  const body = payload.body ?? '새 공구가 등록됐어요!';
  const tag = `deal-${payload.dealId ?? 'general'}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/pwa-192x192.png',
      badge: '/icons/pwa-192x192.png',
      tag,               // deduplicates: same tag replaces the previous notification
      renotify: false,   // don't re-alert for the same tag
      data: {
        dealId: payload.dealId,
        type: payload.type,
        url: payload.dealId ? `/deal/${payload.dealId}` : '/',
      },
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl: string =
    (event.notification.data as { url?: string } | null)?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus an existing window already showing this deal
        const existing = windowClients.find(
          (c) => new URL(c.url).pathname === new URL(targetUrl, self.location.origin).pathname
        );
        if (existing) return existing.focus();

        // No matching window — open a new tab
        return self.clients.openWindow(targetUrl);
      })
  );
});