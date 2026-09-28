import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
function harness() {
  const origin = 'https://folio.test';
  const handlers = {};
  const lifecycle = { skipWaiting: 0, claim: 0 };
  const stores = new Map();
  let offline = false;
  let denyWrites = false;
  const types = new Map();
  const redirects = new Set();
  const responses = new Map([
    ['/', '<script src="/assets/entry.js"></script><link href="/assets/style.css"><script src="https://external.test/assets/no.js"></script>'],
    ['/assets/entry.js', 'export const ready = true;'],
    ['/assets/style.css', 'body { color: black; }'],
    ['/assets/lazy.js', 'export const lazy = true;'],
    ...['/manifest.webmanifest', '/icons/pageecho-192.png', '/icons/pageecho-512.png',
      '/brand/folioduet-narrator-avatar-v1.png', '/brand/folioduet-narrator-tattoo-v4.png', '/brand/folioduet-narrator-v1.png'].map((path) => [path, 'fixture']),
  ]);
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const fetch = async (request) => {
    if (offline) throw new TypeError('Synthetic offline');
    const url = new URL(key(request));
    if (url.origin !== origin) throw new Error('External traffic attempted');
    const body = responses.get(url.pathname);
    const type = types.get(url.pathname) || (url.pathname === '/' ? 'text/html'
      : /\.m?js$/.test(url.pathname) ? 'text/javascript' : /\.css$/.test(url.pathname) ? 'text/css' : 'application/octet-stream');
    const response = new Response(body ?? 'missing', { status: body === undefined ? 404 : 200, headers: { 'Content-Type': type } });
    if (redirects.has(url.pathname)) Object.defineProperty(response, 'redirected', { value: true });
    return response;
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        match: async (request) => store.get(key(request))?.clone(),
        put: async (request, response) => {
          if (denyWrites) throw new Error('Synthetic quota');
          store.set(key(request), response.clone());
        },
        addAll: async (requests) => {
          for (const request of requests) {
            const response = await fetch(request);
            if (!response.ok) throw new Error('Install asset unavailable');
            store.set(key(request), response);
          }
        },
      };
    },
  };
  vm.runInNewContext(source, { URL, Response, fetch, caches, self: {
    location: { origin }, addEventListener: (name, callback) => { handlers[name] = callback; },
    skipWaiting: async () => { lifecycle.skipWaiting++; }, clients: { claim: async () => { lifecycle.claim++; } },
  } });
  async function dispatch(name, request) {
    const pending = [];
    let response;
    handlers[name]({ request, waitUntil: (promise) => pending.push(promise), respondWith: (promise) => { response = promise; } });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  return { origin, stores, responses, types, redirects, caches, dispatch, lifecycle,
    offline: () => { offline = true; }, denyWrites: () => { denyWrites = true; },
    request: (path, mode = 'cors', method = 'GET') => ({ url: new URL(path, origin).href, mode, method }),
  };
}

describe('FolioDuet offline shell', () => {
  it('installs entry assets before the first controlled reload', async () => {
    const h = harness();
    await h.dispatch('install');
    h.offline();
    expect(await (await h.dispatch('fetch', h.request('/assets/entry.js'))).text()).toContain('ready');
    expect(await (await h.dispatch('fetch', h.request('/assets/style.css'))).text()).toContain('color');
  });
  it('caches successful lazy assets but never substitutes HTML for a missing asset', async () => {
    const h = harness();
    await h.dispatch('install');
    await h.dispatch('fetch', h.request('/assets/lazy.js'));
    h.offline();
    expect(await (await h.dispatch('fetch', h.request('/assets/lazy.js'))).text()).toContain('lazy');
    expect((await h.dispatch('fetch', h.request('/assets/missing.js'))).type).toBe('error');
    expect(await (await h.dispatch('fetch', h.request('/?offline=1', 'navigate'))).text()).toContain('<script');
  });
  it('leaves APIs, external traffic, originals and writes outside its cache handler', async () => {
    const h = harness();
    for (const request of [h.request('/api/sync/bootstrap'), h.request('/source.pdf'), h.request('/source.pdf', 'navigate'), h.request('/__/auth/handler', 'navigate'),
      h.request('https://external.test/assets/a.js'), h.request('/assets/entry.js', 'cors', 'POST')]) {
      expect(await h.dispatch('fetch', request)).toBeUndefined();
    }
    expect(h.stores.size).toBe(0);
  });
  it('does not cache HTML, wrong script MIME, or redirected assets', async () => {
    for (const kind of ['html', 'mime', 'redirect']) {
      const h = harness();
      await h.dispatch('install');
      if (kind === 'html') h.types.set('/assets/lazy.js', 'text/html');
      if (kind === 'mime') h.types.set('/assets/lazy.js', 'application/octet-stream');
      if (kind === 'redirect') h.redirects.add('/assets/lazy.js');
      expect((await h.dispatch('fetch', h.request('/assets/lazy.js'))).status).toBe(200);
      h.offline();
      expect((await h.dispatch('fetch', h.request('/assets/lazy.js'))).type).toBe('error');
    }
  });
  it.each(['missing', 'html'])('rejects a %s entry asset without replacing the prior worker shell', async (failure) => {
    const h = harness();
    await (await h.caches.open('pageecho-shell-v3')).put('/', new Response('previous shell'));
    await (await h.caches.open('unrelated-originals')).put('/source.pdf', new Response('unrelated fixture'));
    if (failure === 'html') h.types.set('/assets/entry.js', 'text/html');
    else h.responses.delete('/assets/entry.js');
    await expect(h.dispatch('install')).rejects.toThrow();
    expect(h.lifecycle).toEqual({ skipWaiting: 0, claim: 0 });
    expect(await (await (await h.caches.open('unrelated-originals')).match('/source.pdf')).text()).toBe('unrelated fixture');
    expect(await (await (await h.caches.open('pageecho-shell-v3')).match('/')).text()).toBe('previous shell');
  });
  it('keeps unrelated caches while retiring only older shell versions', async () => {
    const h = harness();
    await h.caches.open('pageecho-shell-v3');
    await h.caches.open('unrelated-originals');
    await h.dispatch('install');
    await h.dispatch('activate');
    expect([...h.stores.keys()].sort()).toEqual(['pageecho-shell-v4', 'unrelated-originals']);
  });
  it('keeps network content usable on cache quota failure and does not cache errors', async () => {
    const h = harness();
    await h.dispatch('install');
    h.denyWrites();
    expect((await h.dispatch('fetch', h.request('/assets/lazy.js'))).status).toBe(200);
    expect((await h.dispatch('fetch', h.request('/assets/missing.js'))).status).toBe(404);
    h.offline();
    expect((await h.dispatch('fetch', h.request('/assets/lazy.js'))).type).toBe('error');
  });
});
