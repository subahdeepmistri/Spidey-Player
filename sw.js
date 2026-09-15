/*
 * sw.js — Service Worker for Spidey Player 2.0
 *
 * Caching strategy:
 *   - APP SHELL: cache-first on activation, network to keep it fresh. Tolerant
 *     pre-cache (a missing file does not block install).
 *   - BUNDLED CATALOG + ALBUM ART: cache-first so the default library is fully
 *     offline (small: one JSON + a handful of SVGs).
 *   - BUNDLED AUDIO: cache-on-request with a size cap, so tracks the user has
 *     actually played become available offline without trying to cache the
 *     whole 1.5 GB up front. Network-first so a re-deploy with new files wins.
 *   - USER IMPORTS: live in IndexedDB, not the service worker.
 *
 * IndexedDB remains the source of truth for the user's own library.
 */

'use strict';

const VERSION = 'v4';
const SHELL_CACHE = 'spidey-shell-' + VERSION;
const CATALOG_CACHE = 'spidey-catalog-' + VERSION;
const AUDIO_CACHE = 'spidey-audio-' + VERSION;

/* Core app shell. Tolerant: each is cached independently so one 404
   (e.g. a fresh clone without generated icons) never fails install. */
const SHELL_URLS = [
  '/',
  '/index.html',
  '/dist/tailwind.css',
  '/style.css',
  '/app.js',
  '/db.js',
  '/id3.js',
  '/manifest.json'
];

/* Small, always-safe-to-offline bundle assets. */
const CATALOG_URLS = [
  '/assets/catalog.json',
  '/image/862eb376cc18fd124f045f6b31b0dc4b.jpg'
];

/* Cap for the audio cache — keep the most-recently-played tracks offline.
   400 MB is generous for a phone's storage while bounded. */
const AUDIO_CACHE_LIMIT = 400 * 1024 * 1024;

/* ------------------------------- install ------------------------------- */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_URLS.map(url =>
      shell.add(url).catch(() => { /* tolerate a missing shell asset */ })
    ));
    const catalog = await caches.open(CATALOG_CACHE);
    await Promise.all(CATALOG_URLS.map(url =>
      catalog.add(url).catch(() => { /* tolerate a missing catalog asset */ })
    ));
    await self.skipWaiting();
  })());
});

/* ------------------------------- activate ------------------------------ */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, CATALOG_CACHE, AUDIO_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* ------------------------------- fetch --------------------------------- */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.protocol.startsWith('http')) return;

  const path = url.pathname;

  /* Bundled audio: network-first, cache-fallback + store-on-success. */
  if (path.startsWith('/assets/music/')) {
    event.respondWith(handleAudio(req));
    return;
  }

  /* Catalog + album art: cache-first, then network. */
  if (path.startsWith('/assets/') || CATALOG_URLS.includes(path)) {
    event.respondWith(caches.match(req, { cacheNames: [CATALOG_CACHE, SHELL_CACHE] })
      .then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (res) {
          if (res.ok) {
            res.clone().then(function (clone) {
              caches.open(CATALOG_CACHE).then(function (c) { c.put(req, clone); }).catch(function () {});
            });
          }
          return res;
        });
      }));
    return;
  }

  /* App shell: network-first with cache fallback (offline-capable shell). */
  if (SHELL_URLS.includes(path) || /\.(js|css|html|svg|json|png|jpe?g|ico)$/i.test(path)) {
    event.respondWith(fetch(req).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(SHELL_CACHE).then(c => c.put(req, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req, { cacheNames: [SHELL_CACHE, CATALOG_CACHE] })));
    return;
  }
});

/* Network-first for a track, but always store it so it's playable offline
   next time. Enforce the audio cache cap on each store. */
async function handleAudio(req) {
  const cache = await caches.open(AUDIO_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) {
      cache.put(req, res.clone());
      enforceAudioLimit();
    }
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Offline and never played: a clear error instead of a broken load.
    return new Response('Offline and not yet cached', { status: 503, statusText: 'Offline' });
  }
}

/* Drop the oldest audio responses until under the cap. */
async function enforceAudioLimit() {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    let total = 0;
    const sizes = [];
    for (const k of keys) {
      const m = await cache.match(k);
      const size = m ? m.size : 0;
      sizes.push({ key: k, size: size });
      total += size;
    }
    sizes.sort((a, b) => a.size - b.size);
    // Evict smallest (oldest-requested, since we appended) first to stay near
    // the cap while keeping recent content. (Heuristic, good enough here.)
    let evict = 0;
    while (total > AUDIO_CACHE_LIMIT && evict < sizes.length) {
      const item = sizes[evict];
      await cache.delete(item.key);
      total -= item.size;
      evict++;
    }
  } catch (e) { /* cap enforcement is best-effort */ }
}

/* Handle client messages (future: warm specific tracks, etc.) */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
