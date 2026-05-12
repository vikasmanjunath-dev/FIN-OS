/**
 * FIN•OS Service Worker — Phase 1
 * Cache name: finos-v1
 * Strategy: Cache-first for static assets, Network-first for HTML pages
 */

'use strict';

const CACHE_NAME = 'finos-v1';

// Pre-cached static assets (relative to sw.js at root)
const PRECACHE_ASSETS = [
  // Key HTML pages
  './html/home.html',
  './html/dashboard.html',
  './html/calculators.html',
  './html/track-finances.html',
  './html/foundations.html',
  // Core CSS
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/animations.css',
  // Core JS
  './js/ui.js',
  './js/mobile-nav.js',
  './js/pwa-init.js',
  './js/theme-init.js',
  './js/guard.js',
  // Manifest & icons
  './manifest.json',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
];

// Offline fallback HTML
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline — FIN•OS</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 20px;
      background: #0B0D12;
      color: #ffffff;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      text-align: center;
      padding: 32px;
    }
    .logo { font-size: 32px; font-weight: 800; color: #C7F000; letter-spacing: 2px; }
    h1 { font-size: 22px; font-weight: 600; margin-top: 8px; }
    p  { font-size: 15px; color: rgba(255,255,255,0.55); max-width: 360px; line-height: 1.6; }
    .dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: #C7F000; opacity: 0.5;
      animation: pulse 1.6s ease-in-out infinite;
    }
    .dots { display: flex; gap: 8px; }
    .dot:nth-child(2) { animation-delay: 0.3s; }
    .dot:nth-child(3) { animation-delay: 0.6s; }
    @keyframes pulse { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }
    button {
      margin-top: 8px;
      padding: 12px 28px;
      background: #C7F000;
      color: #0B0D12;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      letter-spacing: 0.03em;
    }
    button:hover { background: #d4ff00; }
  </style>
</head>
<body>
  <div class="logo">FIN•OS</div>
  <h1>You're offline</h1>
  <p>FIN•OS will be back when you're connected to the internet.</p>
  <div class="dots">
    <div class="dot"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  </div>
  <button onclick="window.location.reload()">Try again</button>
</body>
</html>`;

/* ── Install: pre-cache static assets ──────────────────────────── */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Cache each asset individually so one failure doesn't block all
      return Promise.allSettled(
        PRECACHE_ASSETS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[SW] Failed to cache:', url, err);
          });
        })
      );
    }).then(function () {
      console.log('[SW] Install complete — finos-v1');
      return self.skipWaiting();
    })
  );
});

/* ── Activate: delete old caches ───────────────────────────────── */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function () {
      console.log('[SW] Activated — clients claimed');
      return self.clients.claim();
    })
  );
});

/* ── Fetch: routing strategies ─────────────────────────────────── */
self.addEventListener('fetch', function (event) {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET requests
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // Network-first for HTML pages
  if (path.endsWith('.html') || path === '/' || path.endsWith('/')) {
    event.respondWith(networkFirstHTML(req));
    return;
  }

  // Cache-first for CSS, JS, fonts, images, SVG, JSON (manifest/data)
  if (
    path.endsWith('.css') ||
    path.endsWith('.js') ||
    path.endsWith('.svg') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.webp') ||
    path.endsWith('.woff') ||
    path.endsWith('.woff2') ||
    path.endsWith('.ttf') ||
    path.endsWith('.eot') ||
    path.endsWith('.json')
  ) {
    event.respondWith(cacheFirstStatic(req));
    return;
  }
});

/* ── Strategy: Network-first (HTML) ────────────────────────────── */
function networkFirstHTML(req) {
  return fetch(req)
    .then(function (response) {
      if (response && response.status === 200) {
        // Update the cache with fresh content
        const clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(req, clone);
        });
      }
      return response;
    })
    .catch(function () {
      // Network failed — try cache
      return caches.match(req).then(function (cached) {
        if (cached) return cached;
        // Nothing in cache — return offline page
        return new Response(OFFLINE_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      });
    });
}

/* ── Strategy: Cache-first (static assets) ─────────────────────── */
function cacheFirstStatic(req) {
  return caches.match(req).then(function (cached) {
    if (cached) return cached;
    // Not in cache — fetch and store
    return fetch(req).then(function (response) {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(req, clone);
        });
      }
      return response;
    }).catch(function () {
      // Asset failed to load — return empty 204
      return new Response('', { status: 204 });
    });
  });
}
