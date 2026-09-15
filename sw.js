/*
 * sw.js — Service Worker for Spidey Player 2.0
 *
 * Caching strategy:
 *   - APP SHELL: network-first, cache fallback. Tolerant pre-cache.
 *   - CATALOG + ALBUM ART: cache-first, then network.
 *   - BUNDLED AUDIO: network-first, cache-on-success, size-capped.
 *     Range requests are NOT intercepted (the browser talks to the host
 *     directly so seeking keeps working). Partial 206 responses are never
 *     written to cache.
 *   - USER IMPORTS: IndexedDB, not the service worker.
 */
'use strict';

const VERSION = 'v5';
const SHELL_CACHE = 'spidey-shell-' + VERSION;
const CATALOG_CACHE = 'spidey-catalog-' + VERSION;
const AUDIO_CACHE = 'spidey-audio-' + VERSION;

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

const CATALOG_URLS = [
  '/assets/catalog.json',
  '/image/862eb376cc18fd124f045f6b31b0dc4b.jpg'
];

const AUDIO_CACHE_LIMIT = 400 * 1024 * 1024;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_URLS.map(url =>
      shell.add(url).catch(() => {})
    ));
    const catalog = await caches.open(CATALOG_CACHE);
    await Promise.all(CATALOG_URLS.map(url =>
      catalog.add(url).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, CATALOG_CACHE, AUDIO_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.protocol.startsWith('http')) return;

  // Let the browser handle byte-range requests itself. Intercepting them
  // would cache 206 Partial Content and break seeking / next-track loads.
  if (req.headers.has('Range')) return;

  const path = url.pathname;

  if (path.startsWith('/assets/music/')) {
    event.respondWith(handleAudio(req));
    return;
  }

  if (path.startsWith('/assets/') || CATALOG_URLS.indexOf(path) !== -1) {
    event.respondWith(cacheFirst(req, CATALOG_CACHE));
    return;
  }

  if (SHELL_URLS.indexOf(path) !== -1 || /\.(js|css|html|svg|json|png|jpe?g|ico)$/i.test(path)) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
  }
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(cacheName);
    cache.put(req, res.clone()).catch(() => {});
  }
  return res;
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw e;
  }
}

async function handleAudio(req) {
  const cache = await caches.open(AUDIO_CACHE);
  try {
    const res = await fetch(req);
    // Only cache complete 200s — never 206 partials.
    if (res.status === 200) {
      cache.put(req, res.clone()).catch(() => {});
      enforceAudioLimit();
    }
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response('Offline and not yet cached', { status: 503, statusText: 'Offline' });
  }
}

async function enforceAudioLimit() {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    let total = 0;
    const sizes = [];
    for (const k of keys) {
      const m = await cache.match(k);
      const size = m ? (m.headers.get('Content-Length')|0) : 0;
      sizes.push({ key: k, size: size });
      total += size;
    }
    let i = 0;
    while (total > AUDIO_CACHE_LIMIT && i < sizes.length) {
      await cache.delete(sizes[i].key);
      total -= sizes[i].size;
      i++;
    }
  } catch (e) { /* best-effort */ }
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
