/**
 * FIN•OS Service Worker — Phase 1
 * Cache name: finos-v1
 * Strategy: Cache-first for static assets, Network-first for HTML pages
 */

'use strict';

// Cache version — bump this manually when deploying breaking CSS/JS changes.
// Format: finos-YYYY-MM-DD-N (N = daily build counter).
// The inject-sw-version.js build script can override this automatically.
const CACHE_NAME = (typeof __CACHE_VERSION__ !== 'undefined') ? __CACHE_VERSION__ : 'finos-2026-10-01-2';

// Shared reminder-selection logic (pure; same file the page uses). importScripts() is only allowed during the
// worker's initial evaluation, so it must be here and not inside the periodicsync handler. Failure is non-fatal.
try { importScripts('./js/finos-reminders.js'); } catch (e) { console.warn('[SW] finos-reminders.js unavailable — background reminders disabled'); }

const ICON_URL  = new URL('./assets/icons/icon-192.png', self.registration.scope).href;
const BADGE_URL = new URL('./assets/icons/icon-72.png',  self.registration.scope).href;

// Pre-cached static assets (relative to sw.js at root)
const PRECACHE_ASSETS = [
  // ── Key HTML pages ──────────────────────────────────────────────
  './html/home.html',
  './html/dashboard.html',
  './html/calculators.html',
  './html/track-finances.html',
  './html/foundations.html',
  './html/portfolio.html',
  './html/diagnostics.html',
  './html/scenarios.html',
  './html/insurance-hub.html',
  './html/life-goals-planner.html',
  './html/tax.html',
  './html/markets.html',
  './html/dna.html',
  // ── Core CSS ─────────────────────────────────────────────────────
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/animations.css',
  './css/theme.css',
  // ── Core JS ──────────────────────────────────────────────────────
  './js/ui.js',
  './js/mobile-nav.js',
  './js/pwa-init.js',
  './js/theme-init.js',
  './js/guard.js',
  './js/supabase-config.js',
  './js/finos-toast.js',
  './js/finos-async.js',
  './js/finos-store.js',
  './js/finos-api.js',
  './js/finos-a11y.js',
  './js/finos-contrast.js',
  './js/finos-i18n.js',
  './js/finos-vault-boot.js',
  './js/finos-vault.js',
  './js/finos-format.js',
  './js/finos-taxdates.js',
  './js/finos-context.js',
  './js/arya-ai.js',
  './js/arya-lazy.js',
  './js/arya-guardrails.js',
  './js/arya-pulse-rank.js',
  './js/arya-memory.js',
  './js/arya-life-events.js',
  './js/arya-scenarios.js',
  './js/finos-personalization.js',
  './js/finos-widget.js',
  './js/finos-mobile.js',
  './js/mf-intelligence.js',
  './js/finos-portfolio-analytics.js',
  // ── Manifest & icons ─────────────────────────────────────────────
  './manifest.json',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
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
      console.log('[SW] Install complete — waiting for idle page to activate');
      // DO NOT call skipWaiting() here.
      // We wait for the page to send SKIP_WAITING when not mid-stream,
      // preventing the controllerchange event from interrupting active responses.
    })
  );
});

// Allow the page to trigger skipWaiting safely when it knows the UI is idle
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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

  // Stale-while-revalidate for code and data: instant from cache, refreshed in the background, so a deploy
  // reaches returning visitors on their NEXT load without anyone having to bump CACHE_NAME by hand.
  if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.json')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Cache-first for fonts, images, SVG (immutable in practice)
  if (
    path.endsWith('.svg') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.webp') ||
    path.endsWith('.woff') ||
    path.endsWith('.woff2') ||
    path.endsWith('.ttf') ||
    path.endsWith('.eot')
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

/* ══════════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS — FIN-OS Alert Engine
   ══════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════════
   BACKGROUND REMINDERS — SIP debits, renewals, maturities, tax dates
   The page mirrors the next 45 days of events into IndexedDB (finos/snapshots/upcoming-reminders)
   because a service worker cannot read localStorage. Chrome wakes this handler about twice a day for
   installed PWAs that have the "periodic-background-sync" permission; elsewhere reminders still fire
   while the site is open (js/finos-reminders.js).
   ══════════════════════════════════════════════════════════════════ */
function readReminderSnapshot() {
  return new Promise(function (resolve) {
    if (!self.indexedDB) return resolve(null);
    const open = indexedDB.open('finos');
    // Never create the DB from here — if the page hasn't made it yet, abort so the page's own upgrade still runs.
    open.onupgradeneeded = function (e) { e.target.transaction.abort(); resolve(null); };
    open.onerror = function () { resolve(null); };
    open.onsuccess = function () {
      const db = open.result;
      if (!db.objectStoreNames.contains('snapshots')) { db.close(); return resolve(null); }
      const req = db.transaction('snapshots', 'readonly').objectStore('snapshots').get('upcoming-reminders');
      req.onsuccess = function () { db.close(); resolve(req.result || null); };
      req.onerror = function () { db.close(); resolve(null); };
    };
  });
}
function writeReminderSnapshot(snap) {
  return new Promise(function (resolve) {
    const open = indexedDB.open('finos');
    open.onupgradeneeded = function (e) { e.target.transaction.abort(); resolve(); };
    open.onerror = function () { resolve(); };
    open.onsuccess = function () {
      const db = open.result;
      if (!db.objectStoreNames.contains('snapshots')) { db.close(); return resolve(); }
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put(snap);
      tx.oncomplete = tx.onerror = function () { db.close(); resolve(); };
    };
  });
}

async function runBackgroundReminders() {
  const snap = await readReminderSnapshot();
  if (!snap || !Array.isArray(snap.events)) return;
  const R = self.FinosReminders;
  if (!R || !R.select) return;
  const d = new Date();
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const seen = snap.seen || {};
  const picks = R.select(snap.events, today, seen);
  for (const r of picks) {
    const m = R.message(r);
    await self.registration.showNotification(m.title, { body: m.body, tag: r.key, icon: ICON_URL, badge: BADGE_URL, data: { url: new URL('./html/financial-calendar.html', self.registration.scope).href } });
    seen[r.key] = today;
  }
  if (picks.length) { snap.seen = seen; await writeReminderSnapshot(snap); }
}

self.addEventListener('periodicsync', function (event) {
  if (event.tag === 'finos-reminders') event.waitUntil(runBackgroundReminders());
});

/* Receive push from alert-engine.py via pywebpush */
self.addEventListener('push', function (event) {
  if (!event.data) return;

  let payload = {};
  try { payload = event.data.json(); } catch (e) {
    payload = { title: 'FIN-OS Alert', body: event.data.text() };
  }

  const title   = payload.title   || 'FIN-OS';
  const options = {
    body:    payload.body    || '',
    icon:    ICON_URL,
    badge:   BADGE_URL,
    tag:     payload.tag     || 'finos-alert',
    data:    payload.data    || {},
    vibrate: [150, 50, 150],
    actions: payload.data?.url ? [
      { action: 'open',    title: '📊 Open' },
      { action: 'dismiss', title: '✕ Dismiss' },
    ] : [],
    requireInteraction: payload.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* Handle notification click */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/html/dashboard.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (windowClients) {
        /* Focus existing FIN-OS tab if one is open */
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        /* Otherwise open a new tab */
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

/* Handle push subscription change (browser rotates subscription) */
self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    self.registration.pushManager.subscribe(
      event.oldSubscription.options
    ).then(function (subscription) {
      /* Re-register the new subscription with our backend */
      // Fix [13]: Hardcoded localhost fails in every non-local environment.
      // Use a relative URL so it resolves against the SW's own origin.
      return fetch('/alerts/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh:   subscription.toJSON().keys.p256dh,
          auth_key: subscription.toJSON().keys.auth,
          user_id:  '',   // backend will match by endpoint
        }),
      });
    })
  );
});

/* ── Strategy: Stale-while-revalidate (JS / CSS / JSON) ─────────── */
function staleWhileRevalidate(req) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(req).then(function (cached) {
      const network = fetch(req).then(function (response) {
        if (response && response.status === 200) cache.put(req, response.clone());
        return response;
      }).catch(function () { return cached; });
      return cached || network;                 // cached → instant; background fetch refreshes it
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
      // Fix [12]: 204 told the browser the asset loaded successfully (empty).
      // That silently broke CSS/JS. Return 503 so the browser handles it correctly.
      return new Response('Resource unavailable offline', { status: 503 });
    });
  });
}
