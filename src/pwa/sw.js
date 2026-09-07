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

const SHARED = 'panelist-shared';

/** A PDF shared to the installed app (Web Share Target) is parked in a cache and the app opens it. */
async function receiveShare(request) {
  const form = await request.formData();
  const files = form.getAll('pdf').filter((f) => f && typeof f === 'object' && 'size' in f);
  if (!files.length) return Response.redirect('/', 303);
  const cache = await caches.open(SHARED);
  const keys = [];
  for (const file of files) {
    const key = `/shared/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await cache.put(key, new Response(file, { headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name || 'application.pdf') } }));
    keys.push(key);
  }
  return Response.redirect(`/?shared=${encodeURIComponent(keys.join(','))}`, 303);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share') {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;
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
