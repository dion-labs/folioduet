/** Cold offline shell acceptance with no real backend or external network access. */
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
import { createSyntheticPdf } from './pdf-fixtures.ts';
const modulePath = process.env.FOLIODUET_PLAYWRIGHT_MODULE;
assert(modulePath, 'Set FOLIODUET_PLAYWRIGHT_MODULE to an existing Playwright index.mjs');
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const out = resolve(process.env.FOLIODUET_QA_OUTPUT || 'local-evals/qa/browser-offline');
const root = resolve(out, 'dist');
await mkdir(out, { recursive: true });
// Build a separate public artifact with account/provider configuration disabled.
// The ordinary dist directory and all running application sessions stay intact.
const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', root], {
  env: { ...process.env, VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_API_KEY: '',
    VITE_FIREBASE_APP_ID: '', VITE_FISH_AUDIO_SPONSOR_KEY: '' }, encoding: 'utf8',
});
await writeFile(resolve(out, 'build.log'), `${build.stdout || ''}${build.stderr || ''}`);
assert(build.status === 0, `Offline QA build failed; inspect ${resolve(out, 'build.log')}`);
const legacyWorker = await readFile(new URL('./fixtures/legacy-sw-v3.js', import.meta.url));
const entryPath = (await readFile(resolve(root, 'index.html'), 'utf8')).match(/<script[^>]+src="([^"]+)"/)[1];
let serveLegacyWorker = false;
let failEntry = false;
let origin;
const report = { checkedAt: new Date().toISOString(), node: process.version, blockedExternal: 0, blockedWrites: 0, serviceRequestsStubbed: 0, errors: [],
  scope: 'Isolated Firebase-disabled production build; readonly loopback server and external-denying proxy. Cold offline shell and one previously opened synthetic local PDF, not physical PWA installation or account/provider acceptance.' };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  if (url.origin !== origin) { report.blockedExternal++; res.writeHead(403).end(); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { report.blockedWrites++; res.writeHead(405).end(); return; }
  if (url.pathname.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json' }).end('{"message":"Synthetic offline QA service"}'); return; }
  if (url.pathname === '/sw.js' && serveLegacyWorker) {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }).end(legacyWorker); return;
  }
  if (failEntry && url.pathname === entryPath) { res.writeHead(404).end(); return; }
  const file = resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!file.startsWith(`${root}/`)) { res.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch { res.writeHead(404).end(); }
});
server.on('connect', (_req, socket) => { report.blockedExternal++; socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let page;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.FOLIODUET_CHROME_BIN ? { executablePath: process.env.FOLIODUET_CHROME_BIN } : {}),
    proxy: { server: origin },
  });
  report.engine = `Headless Chrome/Chromium ${browser.version()}`;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => { if (/MIME type|Failed to load module/.test(message.text())) report.errors.push(message.text()); });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Upload your PDF' }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  report.cachedBeforeOffline = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (key) => ({ key, paths: (await (await caches.open(key)).keys()).map((req) => new URL(req.url).pathname) })))));
  await (await context.newCDPSession(page)).send('Network.clearBrowserCache');
  // Stop our owned server too: service-worker fetches must have no live origin.
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  report.offlineShell = await page.getByRole('button', { name: 'Upload your PDF' }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  report.brokenImages = await page.locator('img').evaluateAll(async (images) => {
    await Promise.all(images.map((img) => img.decode().catch(() => {})));
    return images.filter((img) => img.naturalWidth === 0).map((img) => new URL(img.src).pathname);
  });
  await page.screenshot({ path: resolve(out, 'offline-shell.png') });
  // Restore only this owned mock origin, then warm a generated local book.
  await new Promise((r) => server.listen(Number(new URL(origin).port), '127.0.0.1', r));
  await context.setOffline(false);
  await context.route('**/api/**', (route) => {
    const req = route.request();
    if (new URL(req.url()).origin !== origin) return route.abort();
    report.serviceRequestsStubbed++;
    if (req.method() === 'PUT' && new URL(req.url()).pathname.startsWith('/api/sync/')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: req.headers()['content-type']?.includes('json') ? req.postData() || '{}' : '{}' });
    }
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Synthetic unavailable service"}' });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Upload your PDF' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'offline-book.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from(createSyntheticPdf([['OfflineSentinel The explorer reads a local story.', 'The original stays in this disposable browser.']])) });
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  report.onlineBook = (await page.locator('.pe-reader-stage .pe-prose').innerText()).includes('OfflineSentinel');
  await (await context.newCDPSession(page)).send('Network.clearBrowserCache');
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open offline-book', exact: true }).click();
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  const offlineText = await page.locator('.pe-reader-stage .pe-prose').innerText();
  report.offlineBook = offlineText.includes('OfflineSentinel The explorer reads a local story.')
    && offlineText.includes('The original stays in this disposable browser.');
  await page.screenshot({ path: resolve(out, 'offline-book.png') });
  await context.close();
  // A separate fresh profile models the actual prior v3 worker, never a user's installation.
  serveLegacyWorker = true;
  await new Promise((r) => server.listen(Number(new URL(origin).port), '127.0.0.1', r));
  const updateContext = await browser.newContext({ serviceWorkers: 'allow' });
  page = await updateContext.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Upload your PDF' }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.evaluate(async () => {
    window.qaOldWorker = (await navigator.serviceWorker.getRegistration()).active;
    await (await caches.open('qa-unrelated-originals')).put('/qa-original', new Response('Unrelated synthetic original'));
  });
  serveLegacyWorker = false;
  failEntry = true;
  async function updateWorker() {
    return page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Synthetic update did not finish')), 15_000);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'redundant' || worker.state === 'activated') {
              clearTimeout(timer); resolve(worker.state);
            }
          });
        }, { once: true });
        registration.update().catch((error) => { clearTimeout(timer); reject(error); });
      });
    });
  }
  const failedState = await updateWorker();
  report.failedUpdateKeptOld = failedState === 'redundant' && await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration.active === window.qaOldWorker
      && (await caches.keys()).includes('pageecho-shell-v3')
      && (await (await (await caches.open('qa-unrelated-originals')).match('/qa-original')).text()) === 'Unrelated synthetic original';
  });
  failEntry = false;
  report.updateState = await updateWorker();
  await page.waitForFunction(async () => navigator.serviceWorker.controller === (await navigator.serviceWorker.getRegistration()).active);
  report.updatePreservedForeignCache = await page.evaluate(async () => {
    const keys = await caches.keys();
    return keys.includes('pageecho-shell-v4') && !keys.includes('pageecho-shell-v3')
      && (await (await (await caches.open('qa-unrelated-originals')).match('/qa-original')).text()) === 'Unrelated synthetic original';
  });
  await (await updateContext.newCDPSession(page)).send('Network.clearBrowserCache');
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await updateContext.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  report.offlineAfterUpdate = await page.getByRole('button', { name: 'Upload your PDF' }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  await page.screenshot({ path: resolve(out, 'offline-after-update.png') });
  if (!report.offlineShell || !report.onlineBook || !report.offlineBook || !report.failedUpdateKeptOld
      || report.updateState !== 'activated' || !report.updatePreservedForeignCache || !report.offlineAfterUpdate
      || report.errors.length > 0 || report.brokenImages.length > 0) process.exitCode = 1;
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  await page?.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
} finally {
  await browser?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise((r) => server.close(r));
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
