/** Isolated local-browser QA. Never connects to real sync or speech providers. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { createSyntheticPdf } from './pdf-fixtures.ts';

const origin = process.env.FOLIODUET_QA_ORIGIN || 'http://127.0.0.1:5198';
const url = new URL(origin);
assert(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname),
  'Browser QA only accepts a localhost HTTP origin');
const modulePath = process.env.FOLIODUET_PLAYWRIGHT_MODULE;
assert(modulePath, 'Set FOLIODUET_PLAYWRIGHT_MODULE to an existing Playwright index.mjs');
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const out = resolve(process.env.FOLIODUET_QA_OUTPUT || 'local-evals/qa/browser-recovery');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.FOLIODUET_CHROME_BIN ? { executablePath: process.env.FOLIODUET_CHROME_BIN } : {}),
});
let phase = 'startup';
const allContextErrors = [];
const report = {
  checkedAt: new Date().toISOString(), engine: `Headless Chrome/Chromium ${browser.version()}`,
  node: process.version, origin, cases: [], externalRequestsBlocked: 0, serviceRequestsStubbed: 0, serviceRoutes: {},
  scope: 'Synthetic local UI only; no real accounts, providers, audible output or physical device acceptance.',
};
const pdf = createSyntheticPdf(Array.from({ length: 12 }, (_, i) => [
  `Chapter ${i + 1}`,
  ...Array.from({ length: 14 }, (_, j) =>
    `Sentinel${i}part${j} The quiet explorer reads a synthetic story beside the river.`),
]));
const zip = new JSZip();
for (let i = 0; i < 12; i += 1) {
  zip.file(`page_${i + 1}.md`, `# Chapter ${i + 1}\n\n${Array.from({ length: 14 }, (_, j) =>
    `Public${i}part${j} The explorer reads a synthetic public sample by the river.`).join('\n\n')}`);
}
const sampleZip = await zip.generateAsync({ type: 'nodebuffer' });
function record(id, details, passed) {
  report.cases.push({ id, ...details, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${id}`);
  phase = id;
  assert(passed, `${id} failed: ${JSON.stringify(details)}`);
}
async function isolatedContext(sampleFixture = sampleZip) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  context.setDefaultTimeout(10_000);
  context.on('page', (contextPage) => {
    contextPage.on('pageerror', (error) => allContextErrors.push(`${phase}: ${error.message}`));
    contextPage.on('console', (message) => {
      if (/Maximum update depth|Cannot update a component|Too many re-renders/.test(message.text())) {
        allContextErrors.push(`${phase}: ${message.text()}`);
      }
    });
  });
  await context.route('**/*', async (route) => {
    const req = route.request();
    const target = new URL(req.url());
    if (target.origin !== origin) {
      report.externalRequestsBlocked += 1;
      return route.abort();
    }
    if (target.pathname === '/samples/tell-tale-heart.zip') {
      return route.fulfill({ status: 200, contentType: 'application/zip', body: sampleFixture });
    }
    if (target.pathname.startsWith('/api/')) {
      report.serviceRequestsStubbed += 1;
      const routeKey = `${req.method()} ${target.pathname.replace(/document-[^/]+/g, 'document-fixture')}`;
      report.serviceRoutes[routeKey] = (report.serviceRoutes[routeKey] || 0) + 1;
      // Acknowledge writes only inside the browser interceptor; never forward them.
      if (target.pathname.startsWith('/api/sync/') && req.method() !== 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: req.headers()['content-type']?.includes('json') ? req.postData() || '{}' : '{}' });
      }
      return route.fulfill({ status: 503, contentType: 'application/json',
        body: '{"message":"Synthetic service unavailable"}' });
    }
    if (!['GET', 'HEAD'].includes(req.method())) return route.abort();
    return route.continue();
  });
  // HMR is unnecessary for a repeatable candidate run; block all browser sockets.
  await context.routeWebSocket('**/*', (socket) => socket.close());
  await context.addInitScript(() => {
    // Playwright also runs this in the initial opaque about:blank document.
    if (location.protocol !== 'http:') return;
    window.qaSpeech = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value) => { window.qaClipboard = value; } }, configurable: true });
    let speaking = false;
    let paused = false;
    Object.defineProperties(window.speechSynthesis, {
      speaking: { get: () => speaking }, paused: { get: () => paused },
    });
    window.speechSynthesis.speak = (utterance) => {
      speaking = true;
      paused = false;
      window.qaSpeech.push({ volume: utterance.volume });
      setTimeout(() => utterance.onstart?.(new Event('start')), 0);
    };
    window.speechSynthesis.cancel = () => { speaking = false; paused = false; };
    window.speechSynthesis.pause = () => { paused = true; };
    window.speechSynthesis.resume = () => { paused = false; };
    if (!localStorage.getItem('qa-seeded')) {
      localStorage.setItem('bimodal-tts-volume', '0');
      localStorage.setItem('qa-seeded', '1');
    }
  });
  return context;
}
async function checkMarkers(page, id, pattern = /Sentinel\d+part\d+/g, expected = 168) {
  const seen = [];
  const clipped = [];
  for (let i = 1; i <= 100; i += 1) {
    await page.getByRole('textbox', { name: 'Current page' }).fill(String(i));
    // Allow the visible-page overflow correction to finish before collecting text.
    await page.waitForTimeout(150);
    if (Number(await page.getByRole('textbox', { name: 'Current page' }).inputValue()) !== i) break;
    seen.push(...[...(await page.locator('.pe-reader-stage').innerText()).matchAll(pattern)]
      .map((match) => match[0]));
    const geometry = await page.locator('.pe-page-body').evaluate((body) => {
      const style = getComputedStyle(body);
      const prose = body.querySelector('.pe-prose');
      return { height: body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
        proseHeight: prose?.scrollHeight || 0, overflow: style.overflowY };
    });
    if (geometry.proseHeight > geometry.height + 2 && !['auto', 'scroll'].includes(geometry.overflow)) {
      clipped.push({ page: i, ...geometry });
    }
    if (await page.getByRole('button', { name: 'Next page', exact: true }).first().isDisabled()) break;
  }
  record(id, { unique: new Set(seen).size, total: seen.length, clipped },
    new Set(seen).size === expected && seen.length === expected && clipped.length === 0);
}
let page;
try {
  const context = await isolatedContext();
  page = await context.newPage();
  const pageErrors = [];
  const renderErrors = [];
  page.on('console', (message) => {
    if (/Maximum update depth|Cannot update a component|Too many re-renders/.test(message.text())) renderErrors.push(`${phase}: ${message.text()}`);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${origin}/?testVolume=0`);
  assert(await page.evaluate(async () => (await import('/src/v2/firebase/config.ts')).readFirebaseConfig() === null),
    'Start Vite with Firebase environment disabled');
  await page.getByRole('button', { name: 'Upload your PDF' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-recovery.pdf',
    mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await page.getByRole('textbox', { name: 'Current page' }).waitFor();
  await page.waitForTimeout(1500);
  const volume = await page.getByRole('slider', { name: 'Playback volume' }).inputValue();
  record('PREF-01', { volume }, volume === '0');
  const idleRequestsBefore = report.serviceRoutes['POST /api/tts/synthesize'] || 0;
  await page.waitForTimeout(1200);
  const idleRequestsAfter = report.serviceRoutes['POST /api/tts/synthesize'] || 0;
  record('TTS-05-bounded-prefetch', { requestsDuringIdle: idleRequestsAfter - idleRequestsBefore },
    idleRequestsAfter - idleRequestsBefore <= 3);
  await checkMarkers(page, 'READ-05');
  const documentId = await page.evaluate(() => JSON.parse(localStorage.getItem('bimodal-library'))[0].id);
  await page.evaluate((id) => {
    const key = `pageecho-viewport-pack-v1:${id}`;
    const cached = JSON.parse(localStorage.getItem(key));
    cached.pageStarts = [0, 9999, 1];
    localStorage.setItem(key, JSON.stringify(cached));
  }, documentId);
  await page.reload();
  await page.waitForTimeout(2000);
  const starts = await page.evaluate((id) =>
    JSON.parse(localStorage.getItem(`pageecho-viewport-pack-v1:${id}`)).pageStarts, documentId);
  record('READ-10', { starts }, starts.every((n, i, a) => Number.isInteger(n) && n < 100 && (i === 0 ? n === 0 : n > a[i - 1])));
  record('READ-06-reflow', {}, await page.getByText(/Preparing page/).count() === 0);
  await checkMarkers(page, 'READ-10-content');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  const preparing = await page.getByText(/Preparing page/).count();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  record('READ-04', { width: 390, preparing, overflow }, preparing === 0 && !overflow);
  await page.screenshot({ path: `${out}/narrow.png` });
  await checkMarkers(page, 'READ-04-content');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${origin}/?testVolume=0&d=sample%3Atell-tale-heart&p=2&b=0&s=broken`);
  await page.waitForTimeout(2000);
  const handoffPage = Number(await page.getByRole('textbox', { name: 'Current page' }).inputValue());
  record('HAND-05', { requestedPage: 3, actualPage: handoffPage }, handoffPage === 3);
  await page.getByRole('button', { name: 'Handoff to phone' }).click();
  const qr = page.getByRole('img', { name: 'QR code to continue reading on another device' });
  await qr.waitFor();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('button', { name: 'Copied', exact: true }).waitFor();
  const copied = new URL(await page.evaluate(() => window.qaClipboard));
  record('HAND-01-QR-copy-stub', {}, copied.searchParams.get('d') === 'sample:tell-tale-heart'
    && Number.isSafeInteger(Number(copied.searchParams.get('s')))
    && await qr.evaluate((image) => image.naturalWidth > 0));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByText('Neural voice unavailable · using system fallback').waitFor();
  const fallbackSpeech = await page.evaluate(() => window.qaSpeech);
  record('TTS-04-provider-failure-stub', { utterances: fallbackSpeech.length }, fallbackSpeech.length > 0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  const pausedRequests = report.serviceRoutes['POST /api/tts/synthesize'] || 0;
  await page.getByRole('button', { name: 'Next page', exact: true }).first().click();
  await page.waitForTimeout(1200);
  const navigationRequests = (report.serviceRoutes['POST /api/tts/synthesize'] || 0) - pausedRequests;
  record('TTS-05-post-pause-navigation', { requestsDuringWindow: navigationRequests, durationMs: 1200 }, navigationRequests <= 3);
  const reloadVolume = await page.getByRole('slider', { name: 'Playback volume' }).inputValue();
  record('PREF-01-reload', { volume: reloadVolume }, reloadVolume === '0');
  await page.evaluate(() => {
    const preferences = JSON.parse(localStorage.getItem('pageecho-v2-preferences'));
    preferences.fishAudioEnabled = false;
    preferences.inworldEnabled = false;
    localStorage.setItem('pageecho-v2-preferences', JSON.stringify(preferences));
    localStorage.setItem('pageecho-fish-default-v1', '1');
  });
  await page.reload();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  const speech = await page.evaluate(() => window.qaSpeech);
  record('TTS-muted-stub', { utterances: speech.length }, speech.length > 0 && speech.every((u) => u.volume === 0));
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  record('TTS-pause-stub', {}, true);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Add books', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.pdf',
    mimeType: 'application/pdf', buffer: Buffer.from('%PDF-broken') });
  await page.getByRole('heading', { name: 'This book could not be opened' }).waitFor();
  await page.getByRole('button', { name: 'Import another file', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'recovered.pdf',
    mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await page.waitForTimeout(1500);
  record('IMP-07-browser', {}, (await page.locator('.pe-reader-stage').innerText()).includes('Sentinel0part0'));
  await page.evaluate(() => localStorage.setItem('pageecho-pending-handoff', JSON.stringify({
    documentId: 'sample:tell-tale-heart', pageIndex: 2, blockIndex: 0, wordIndex: 0,
  })));
  await page.reload();
  await page.getByRole('button', { name: 'Continue reading', exact: true }).waitFor();
  const beforeAccept = await page.evaluate(() => localStorage.getItem('bimodal-active-doc'));
  await page.getByRole('button', { name: 'Continue reading', exact: true }).click();
  await page.waitForTimeout(1500);
  const acceptedPage = Number(await page.getByRole('textbox', { name: 'Current page' }).inputValue());
  record('HAND-stored-confirm', { acceptedPage }, beforeAccept !== 'sample:tell-tale-heart' && acceptedPage === 3);
  await page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('bimodal-library'));
    const active = localStorage.getItem('bimodal-active-doc');
    const book = library.find((entry) => entry.id === active);
    book.currentPageIndex = 999;
    delete book.activeStreamIndex;
    localStorage.setItem('bimodal-library', JSON.stringify(library));
  });
  await page.reload();
  await page.waitForTimeout(2000);
  const legacyPage = Number(await page.getByRole('textbox', { name: 'Current page' }).inputValue());
  record('READ-06-legacy-corruption', { legacyPage }, legacyPage < 999 && await page.getByText(/Preparing page/).count() === 0);
  await checkMarkers(page, 'READ-13-finalized-content', /Public\d+part\d+/g);
  record('BROWSER-errors', { pageErrors, renderErrors: [...new Set(renderErrors)] }, pageErrors.length === 0 && renderErrors.length === 0);
  await page.screenshot({ path: `${out}/reader.png` });
  await context.close();

  const tallZip = new JSZip();
  tallZip.file('page_1.md', '# Tall fixture\n\n'
    + Array.from({ length: 450 }, (_, i) => `Tall${i} the explorer travels beside the river.`).join(' ')
    + '\n\n' + Array.from({ length: 20 }, (_, i) => `Short${i} the evening settles calmly beside the river.`).join('\n\n'));
  const tallFixture = await tallZip.generateAsync({ type: 'nodebuffer' });
  const tallContext = await isolatedContext(tallFixture);
  page = await tallContext.newPage();
  const tallErrors = [];
  page.on('pageerror', (error) => tallErrors.push(error.message));
  page.on('console', (message) => {
    if (/Maximum update depth|Cannot update a component|Too many re-renders/.test(message.text())) tallErrors.push(message.text());
  });
  await page.goto(`${origin}/?testVolume=0&d=sample%3Atell-tale-heart&p=0&s=0`);
  await page.waitForTimeout(500);
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  await checkMarkers(page, 'READ-14-tall-first', /Tall\d+/g, 450);
  const tallCache = await page.evaluate(() => localStorage.getItem('pageecho-viewport-pack-v1:sample:tell-tale-heart'));
  record('READ-14-cache-identity', {}, tallCache === null);
  await page.reload();
  await page.waitForTimeout(500);
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  await checkMarkers(page, 'READ-14-tall-reload', /Tall\d+/g, 450);
  record('READ-14-console', { errors: tallErrors }, tallErrors.length === 0);
  await page.screenshot({ path: `${out}/tall-reader.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  await page.getByRole('textbox', { name: 'Current page' }).fill('5');
  await page.waitForTimeout(250);
  const originWord = (await page.locator('.pe-reader-stage .pe-word.is-active').innerText()).trim();
  async function copyHandoff(sourcePage) {
    await sourcePage.getByRole('button', { name: 'Handoff to phone' }).click();
    await sourcePage.getByRole('button', { name: 'Copy', exact: true }).click();
    await sourcePage.getByRole('button', { name: 'Copied', exact: true }).waitFor();
    return sourcePage.evaluate(() => window.qaClipboard);
  }
  const narrowLink = await copyHandoff(page);
  const wideHandoff = await isolatedContext(tallFixture);
  page = await wideHandoff.newPage();
  await page.goto(narrowLink);
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  await page.waitForFunction(() => localStorage.getItem('pageecho-pending-handoff') === null);
  await page.waitForTimeout(100);
  const wideWord = (await page.locator('.pe-reader-stage .pe-word.is-active').innerText()).trim();
  record('HAND-08-narrow-to-wide', { originWord, actualWord: wideWord },
    originWord.startsWith('Tall') && wideWord === originWord && new URL(narrowLink).searchParams.has('gw'));
  const wideLink = await copyHandoff(page);
  const narrowHandoff = await isolatedContext(tallFixture);
  page = await narrowHandoff.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(wideLink);
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  await page.waitForFunction(() => localStorage.getItem('pageecho-pending-handoff') === null);
  await page.waitForTimeout(100);
  const narrowWord = (await page.locator('.pe-reader-stage .pe-word.is-active').innerText()).trim();
  record('HAND-08-wide-to-narrow', { originWord, actualWord: narrowWord }, narrowWord === originWord);
  // Mobile chrome intentionally overlays the page briefly on entry, then hides.
  await page.locator('.pe-app.is-focus-reading:not(.is-chrome-visible)').waitFor();
  await page.waitForTimeout(350);
  const anchorVisibility = await page.locator('.pe-reader-stage .pe-word.is-active').evaluate((word) => {
    const rect = word.getBoundingClientRect();
    const topPoint = document.elementFromPoint(rect.x + rect.width / 2, rect.y + 1);
    const bottomPoint = document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 1);
    return { top: rect.top, bottom: rect.bottom, visible: rect.top >= 0 && rect.bottom <= innerHeight
      && word.contains(topPoint) && word.contains(bottomPoint) };
  });
  record('UI-04-settled-handoff-anchor', anchorVisibility, anchorVisibility.visible);
  await page.screenshot({ path: `${out}/handoff-split-paragraph.png` });
  await narrowHandoff.close();
  await wideHandoff.close();
  await tallContext.close();

  const delayedContext = await isolatedContext();
  await delayedContext.addInitScript(() => {
    Object.defineProperty(globalThis, 'scheduler', { configurable: true, value: {
      yield: () => new Promise((resolve) => setTimeout(resolve, 80)),
    } });
  });
  page = await delayedContext.newPage();
  await page.goto(`${origin}/?testVolume=0`);
  await page.getByRole('button', { name: 'Upload your PDF' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'old-fixture.pdf',
    mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await page.waitForTimeout(500);
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  await page.goto(`${origin}/?testVolume=0&d=sample%3Atell-tale-heart&p=2&b=0&s=broken`);
  await page.waitForFunction(() =>
    document.querySelector('.pe-reader-stage')?.getAttribute('aria-busy') === 'true'
    && document.querySelector('.pe-reader-stage .pe-prose')?.textContent?.includes('Public')
    && localStorage.getItem('bimodal-active-doc') === 'sample:tell-tale-heart');
  const pendingDuringMeasurement = await page.evaluate(() => localStorage.getItem('pageecho-pending-handoff'));
  record('HAND-07-preserve-provisional-target', {}, pendingDuringMeasurement !== null);
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  await page.waitForFunction(() => localStorage.getItem('pageecho-pending-handoff') === null);
  const delayedPage = Number(await page.getByRole('textbox', { name: 'Current page' }).inputValue());
  const delayedDocument = await page.evaluate(() => localStorage.getItem('bimodal-active-doc'));
  record('HAND-07-final-target-identity', { requestedPage: 3, actualPage: delayedPage },
    delayedPage === 3 && delayedDocument === 'sample:tell-tale-heart');
  await delayedContext.close();

  const batchContext = await isolatedContext();
  let failSecond = true;
  await batchContext.route(/\/api\/sync\/documents\/[^/]+\/source\?fileName=second\.pdf$/, (route) => {
    if (new URL(route.request().url()).origin !== origin) return route.abort();
    if (!failSecond) return route.fallback();
    report.serviceRequestsStubbed += 1;
    return route.fulfill({ status: 503, contentType: 'application/json',
      body: '{"message":"Synthetic second-file failure"}' });
  });
  page = await batchContext.newPage();
  await page.goto(`${origin}/?testVolume=0`);
  await page.getByRole('button', { name: 'Upload your PDF' }).click();
  const batchPdf = createSyntheticPdf([['A synthetic first book.', 'FirstSentinel The explorer returns home.']]);
  await page.locator('input[type=file]').setInputFiles(['first.pdf', 'second.pdf'].map((name) => ({
    name, mimeType: 'application/pdf', buffer: Buffer.from(batchPdf),
  })));
  await page.getByRole('alert').waitFor();
  const batchError = await page.getByRole('alert').innerText();
  const firstImported = await page.evaluate(() => JSON.parse(localStorage.getItem('bimodal-library')));
  record('IMP-11-partial-batch', { retained: firstImported.length },
    firstImported.length === 1 && firstImported[0].name === 'first' && batchError.includes('1 book added'));
  failSecond = false;
  await page.locator('input[type=file]').setInputFiles({ name: 'second.pdf',
    mimeType: 'application/pdf', buffer: Buffer.from(batchPdf) });
  await page.getByRole('dialog', { name: 'Import PDF books' }).waitFor({ state: 'hidden' });
  const retried = await page.evaluate(() => JSON.parse(localStorage.getItem('bimodal-library')));
  record('IMP-11-retry-only-failed-file', { total: retried.length },
    retried.length === 2 && retried.some((book) => book.id === firstImported[0].id));
  const librarySearch = page.getByRole('textbox', { name: 'Search your library' });
  await librarySearch.fill('  FIRST  ');
  record('LIB-01-search', {}, await page.locator('.pe-book-card').count() === 1
    && await page.locator('.pe-book-card h3').innerText() === 'first');
  await librarySearch.fill('missing synthetic title');
  record('LIB-01-empty-search', {}, await page.getByText('No matching books', { exact: true }).isVisible());
  await librarySearch.fill('');
  const openFirst = page.getByRole('button', { name: 'Open first', exact: true });
  await openFirst.focus();
  await openFirst.press('Enter');
  await page.waitForFunction((id) => localStorage.getItem('bimodal-active-doc') === id, firstImported[0].id);
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  const reopenedText = await page.locator('.pe-reader-stage').innerText();
  record('LIB-02-reopen', {}, reopenedText.includes('FirstSentinel'));
  record('READ-15-title-substring', {}, reopenedText.includes('A synthetic first book.')
    && reopenedText.includes('FirstSentinel The explorer returns home.'));
  const openSecond = page.getByRole('button', { name: 'Open second', exact: true });
  await openSecond.focus();
  await openSecond.press('Space');
  const secondId = retried.find((book) => book.name === 'second').id;
  await page.waitForFunction((id) => localStorage.getItem('bimodal-active-doc') === id, secondId);
  await openFirst.focus();
  await openFirst.press('Enter');
  await page.waitForFunction((id) => localStorage.getItem('bimodal-active-doc') === id, firstImported[0].id);
  record('UI-03-keyboard-open', {}, true);
  await page.screenshot({ path: `${out}/library-keyboard.png` });
  const deleteCount = () => Object.entries(report.serviceRoutes)
    .filter(([key]) => key.startsWith('DELETE ')).reduce((sum, [, value]) => sum + value, 0);
  const deletesBeforeCancel = deleteCount();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete first', exact: true }).click();
  record('LIB-03-cancel-delete', {}, deleteCount() === deletesBeforeCancel
    && (await page.evaluate(() => JSON.parse(localStorage.getItem('bimodal-library')))).length === 2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete first', exact: true }).click();
  await page.waitForFunction((id) => !JSON.parse(localStorage.getItem('bimodal-library')).some((book) => book.id === id), firstImported[0].id);
  await page.waitForFunction(async (id) => (await import('/src/v2/storage.ts')).loadSourceFile({ id }).then((file) => file === null), firstImported[0].id);
  const afterDelete = await page.evaluate(() => ({ library: JSON.parse(localStorage.getItem('bimodal-library')),
    active: localStorage.getItem('bimodal-active-doc') }));
  record('LIB-03-delete-active', { retained: afterDelete.library.length },
    afterDelete.library.length === 1 && afterDelete.library[0].name === 'second'
    && afterDelete.active !== firstImported[0].id && deleteCount() === deletesBeforeCancel + 1);
  const remainingBytes = await page.evaluate(async (id) => {
    const file = await (await import('/src/v2/storage.ts')).loadSourceFile({ id });
    return file ? Array.from(new Uint8Array(await file.arrayBuffer())) : [];
  }, afterDelete.library[0].id);
  record('LIB-03-preserve-other-source', {}, Buffer.from(remainingBytes).equals(Buffer.from(batchPdf)));
  await page.reload();
  await page.getByRole('button', { name: 'Delete second', exact: true }).waitFor();
  record('LIB-03-delete-reload', {}, await page.getByRole('button', { name: 'Delete first', exact: true }).count() === 0);
  const differentPdf = createSyntheticPdf([['DifferentSentinel A separate story survives the shared filename.']]);
  await page.getByRole('button', { name: 'Add books', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'second.pdf',
    mimeType: 'application/pdf', buffer: Buffer.from(differentPdf) });
  await page.getByRole('dialog', { name: 'Import PDF books' }).waitFor({ state: 'hidden' });
  await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
  record('IMP-08-same-name-new-content', {}, (await page.locator('.pe-reader-stage').innerText()).includes('DifferentSentinel'));
  await page.getByRole('button', { name: 'Add books', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'second.pdf',
    mimeType: 'application/pdf', buffer: Buffer.from(batchPdf) });
  await page.getByRole('dialog', { name: 'Import PDF books' }).waitFor({ state: 'hidden' });
  const sameNameBooks = await page.evaluate(async () => {
    const storage = await import('/src/v2/storage.ts');
    return Promise.all(JSON.parse(localStorage.getItem('bimodal-library')).map(async (book) => {
      const file = await storage.loadSourceFile(book);
      return { id: book.id, name: book.name, bytes: file ? Array.from(new Uint8Array(await file.arrayBuffer())) : [] };
    }));
  });
  const originalCopies = sameNameBooks.filter((book) => Buffer.from(book.bytes).equals(Buffer.from(batchPdf))).length;
  const differentCopies = sameNameBooks.filter((book) => Buffer.from(book.bytes).equals(Buffer.from(differentPdf))).length;
  record('IMP-08-distinct-originals', { books: sameNameBooks.length, originalCopies, differentCopies },
    sameNameBooks.length === 3 && new Set(sameNameBooks.map((book) => book.id)).size === 3
    && sameNameBooks.every((book) => book.name === 'second')
    && originalCopies === 2 && differentCopies === 1
    && sameNameBooks.some((book) => book.id === secondId));
  for (const [name, sentence] of [['hello', 'Hello!'], ['Never Again', 'Never again.']]) {
    await page.getByRole('button', { name: 'Add books', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({ name: `${name}.pdf`,
      mimeType: 'application/pdf', buffer: Buffer.from(createSyntheticPdf([[sentence]])) });
    await page.getByRole('dialog', { name: 'Import PDF books' }).waitFor({ state: 'hidden' });
    await page.locator('.pe-reader-stage[aria-busy="false"] .pe-prose').waitFor();
    record(`READ-15-exact-prose-${name}`, {}, (await page.locator('.pe-reader-stage .pe-prose').innerText()).trim() === sentence);
  }
  await batchContext.close();

  const storageContext = await isolatedContext();
  await storageContext.addInitScript(() => {
    window.qaDenyStorage = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (window.qaDenyStorage && key === 'bimodal-library') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  page = await storageContext.newPage();
  await page.goto(`${origin}/?testVolume=0`);
  await page.getByRole('button', { name: 'Try saving again' }).waitFor();
  record('STORE-01', {}, await page.getByRole('button', { name: 'Upload your PDF' }).isVisible());
  await page.screenshot({ path: `${out}/storage-warning.png` });
  await page.evaluate(() => { window.qaDenyStorage = false; });
  await page.getByRole('button', { name: 'Try saving again' }).click();
  await page.getByRole('button', { name: 'Try saving again' }).waitFor({ state: 'hidden' });
  record('STORE-02', {}, await page.evaluate(() => localStorage.getItem('bimodal-library')) === '[]');
  await storageContext.close();
  record('BROWSER-all-contexts', { errors: allContextErrors }, allContextErrors.length === 0);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
