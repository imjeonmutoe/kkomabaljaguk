import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ── Service Worker registration ───────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Listen for a new SW version found while the page is open
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            // 'installed' + existing controller = update ready but not yet active
            if (
              installingWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              showUpdateBanner(registration);
            }
          });
        });
      })
      .catch((err) => {
        console.error('[SW] registration failed:', err);
      });

    // When the active SW changes (after SKIP_WAITING), reload to apply updates
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}

// ── Update banner ─────────────────────────────────────────────────────────────
// Injected outside React so it works regardless of router state.
// Inline styles are intentional — Tailwind purges classes not in source files.

function showUpdateBanner(registration: ServiceWorkerRegistration): void {
  if (document.getElementById('sw-update-banner')) return; // already shown

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';

  Object.assign(banner.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    zIndex: '9999',
    background: '#1A56A0',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    gap: '12px',
    boxShadow: '0 -2px 10px rgba(0,0,0,.2)',
    fontFamily: 'sans-serif',
    fontSize: '14px',
  });

  const message = document.createElement('span');
  message.textContent = '새 버전이 준비됐어요.';

  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '새로고침';
  Object.assign(refreshBtn.style, {
    background: '#fff',
    color: '#1A56A0',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    flexShrink: '0',
  });

  refreshBtn.addEventListener('click', () => {
    // Tell the waiting SW to activate immediately
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    // controllerchange listener above will reload the page
  });

  banner.appendChild(message);
  banner.appendChild(refreshBtn);
  document.body.appendChild(banner);
}