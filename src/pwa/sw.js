/*
 * Panelist service worker: caches the application shell so the app opens instantly on a
 * phone and survives a flaky connection. It never touches /api: reviews, notes, and
 * PDFs must always come from the server or the app's own local database.
 *
 * `__BUILD__` is replaced at build time (vite.config.ts), so every deploy gets a fresh
 * cache and `activate` discards the previous one.
 */
const CACHE = 'panelist-shell-__BUILD__';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/healthz')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then((cache) => cache.match('/index.html').then((hit) => hit || cache.match('/')))));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/pdfjs/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((response) => {
              if (response && response.ok) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
  }
});
