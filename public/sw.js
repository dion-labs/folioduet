const CACHE_PREFIX = 'pageecho-shell-';
// Bump for each deployed worker change so failed installation cannot replace an active shell.
const CACHE = `${CACHE_PREFIX}v4`;
const SHELL = [
  '/', '/manifest.webmanifest', '/icons/pageecho-192.png', '/icons/pageecho-512.png',
  '/brand/folioduet-narrator-avatar-v1.png', '/brand/folioduet-narrator-tattoo-v4.png',
  '/brand/folioduet-narrator-v1.png',
];

function cacheableAsset(url, response) {
  const type = response.headers.get('Content-Type') || '';
  if (!response.ok || response.redirected || /text\/html/i.test(type)) return false;
  if (/\.m?js$/.test(url.pathname)) return /(?:java|ecma)script/i.test(type);
  if (/\.css$/.test(url.pathname)) return /text\/css/i.test(type);
  if (/\.wasm$/.test(url.pathname)) return /application\/wasm/i.test(type);
  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // The first page can finish loading before this worker controls it. Include
    // its built entry scripts/styles now so the first offline reload works.
    const html = await (await cache.match('/')).text();
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter((url) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'))
      .map((url) => url.href);
    await cache.addAll([...new Set(assets)]);
    for (const path of [...SHELL.filter((path) => path !== '/'), ...assets]) {
      const url = new URL(path, self.location.origin);
      if (!cacheableAsset(url, await cache.match(url.href))) throw new Error('Invalid offline static asset');
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Never cache accounts, API responses, originals, or external provider traffic.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const navigation = request.mode === 'navigate' && url.pathname === '/';
  const staticAsset = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/') || SHELL.includes(url.pathname);
  if (!navigation && !staticAsset) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && (navigation ? /text\/html/i.test(response.headers.get('Content-Type') || '') : cacheableAsset(url, response))) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(navigation ? '/' : request, copy)).catch(() => {}));
      }
      return response;
    } catch {
      try {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        // HTML is a navigation fallback, never a substitute for JS/CSS/WASM.
        if (navigation) return (await cache.match('/')) || Response.error();
      } catch { /* Storage can be unavailable; preserve a normal network failure. */ }
      return Response.error();
    }
  })());
});
