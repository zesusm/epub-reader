// EPUB Reader service worker — caches the app shell for offline reading.
// Scope is intentionally narrow: only same-origin GET requests for the app's
// own static assets are cached. EPUB files (opened from the device via the file
// picker) and any future translation API calls are NOT cached — they go straight
// to the network.

const CACHE_NAME = 'epub-reader-shell-v1';
const APP_SHELL = [
  './epub_reader.html',
  './manifest.webmanifest',
  './lib/jszip.min.js',
  './lib/epub.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// install: pre-cache the app shell, then activate immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// activate: drop any old cache versions, then take control of clients.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// fetch: cache-first for same-origin GET requests; network otherwise.
// EPUB blobs, translation API calls, and cross-origin requests bypass the cache.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;              // never intercept non-GET
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin → straight to net

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;                  // serve cached shell
      return fetch(req).then((resp) => {
        // Optionally cache newly-fetched same-origin assets on the fly (e.g. an
        // icon we missed). Only cache successful, basic responses.
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return resp;
      }).catch(() => {
        // Offline and not cached: for navigations, fall back to the reader page
        // so the app still loads (even if the exact URL wasn't pre-cached).
        if (req.mode === 'navigate') {
          return caches.match('./epub_reader.html');
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
