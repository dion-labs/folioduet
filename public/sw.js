const CACHE = 'pageecho-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/pageecho-192.png', '/icons/pageecho-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      return cached || caches.match('/');
    }),
  );
});
