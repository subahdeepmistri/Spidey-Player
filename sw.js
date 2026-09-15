/*
 * sw.js — Service Worker for Spidey Player 2.0
 *
 * Strategy:
 * - Precache app shell (HTML, CSS, JS) on install
 * - Runtime cache for audio blobs (network-first, fallback to cache)
 * - IndexedDB is the source of truth for library; SW doesn't cache audio files
 *   (they're stored as Blobs in IDB, not served from network)
 * - Clean up old caches on activate
 */

'use strict';

const CACHE_NAME = 'spidey-player-v3';
const ASSET_CACHE = 'spidey-assets-v3';

/* Files to precache — app shell only. Audio blobs live in IndexedDB. */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/dist/tailwind.css',
  '/app.js',
  '/db.js',
  '/id3.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

/* Install: precache app shell */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* Activate: clean old caches, claim clients */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== ASSET_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* Fetch: network-first for HTML/JS/CSS, cache-first for icons/images */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Only handle same-origin requests */
  if (url.origin !== location.origin) return;

  /* Skip non-GET */
  if (event.request.method !== 'GET') return;

  /* Skip chrome-extension, data: URLs, etc. */
  if (!url.protocol.startsWith('http')) return;

  const isAsset = url.pathname.match(/\.(png|svg|ico|webmanifest)$/);
  const isShell = url.pathname === '/' ||
                  url.pathname.endsWith('.html') ||
                  url.pathname.endsWith('.js') ||
                  url.pathname.endsWith('.css') ||
                  url.pathname === '/manifest.json';

  if (isShell) {
    /* Network-first for shell — always try to get fresh version */
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (isAsset) {
    /* Cache-first for static assets */
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request)
          .then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(ASSET_CACHE).then(cache => cache.put(event.request, clone));
            }
            return response;
          })
        )
    );
    return;
  }

  /* Default: network-only for everything else (API calls, etc.) */
});

/* Handle messages from clients */
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data?.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(ASSET_CACHE).then(cache => cache.addAll(event.data.urls))
    );
  }
});

/* Background sync for future enhancements (e.g., queued imports) */
self.addEventListener('sync', event => {
  if (event.tag === 'import-sync') {
    event.waitUntil(/* future: process queued imports */);
  }
});

/* Push notifications (placeholder for future) */
self.addEventListener('push', event => {
  /* Not implemented — local-first app doesn't need server push */
});

/* Periodic background sync (placeholder) */
self.addEventListener('periodicsync', event => {
  /* Not implemented */
});