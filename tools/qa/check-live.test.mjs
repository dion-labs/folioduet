import { describe, expect, it } from 'vitest';
import { checkAuthorizedDomains } from './check-live.mjs';

const required = ['folioduet.dionlabs.ai', 'boxie.dionlabs.ai'];
describe('shared Firebase auth configuration regression', () => {
  it('rejects the Boxie-only allowlist that broke FolioDuet sign-in', () => {
    expect(() => checkAuthorizedDomains({ authorizedDomains: ['boxie.dionlabs.ai'] }, required))
      .toThrow('folioduet.dionlabs.ai');
  });
  it('rejects a FolioDuet repair that removes Boxie', () => {
    expect(() => checkAuthorizedDomains({ authorizedDomains: ['folioduet.dionlabs.ai'] }, required))
      .toThrow('boxie.dionlabs.ai');
  });
  it('allows additional shared domains and rejects absent configuration', () => {
    expect(() => checkAuthorizedDomains({ authorizedDomains: [...required, 'localhost'] }, required)).not.toThrow();
    expect(() => checkAuthorizedDomains({}, required)).toThrow('missing');
  });
});

// Synthetic responses only: no provider credentials, requests or user documents.
const origin = 'https://folio.example';
const legacyOrigin = 'https://old.example';
const syntheticKey = `AIza${'x'.repeat(35)}`;
function fakeSite(overrides = {}) {
  return async (input) => {
    const url = new URL(input);
    const path = url.hostname === 'identitytoolkit.googleapis.com' ? '/config'
      : url.origin === legacyOrigin ? '/legacy' : url.pathname;
    const routes = {
      '/': ['<title>FolioDuet</title><script src="/assets/app.js"></script>', {
        headers: { 'cross-origin-opener-policy': 'same-origin-allow-popups' },
      }],
      '/assets/app.js': [`const config = "${syntheticKey} dionlabs-fe92e.firebaseapp.com";`, {
        headers: { 'content-type': 'application/javascript' },
      }],
      '/config': [JSON.stringify({ projectId: '263927058814', authorizedDomains: required })],
      '/pdf-to-audiobook/': ['<h1>FolioDuet</h1>'],
      '/read-and-listen-to-pdf/': ['<h1>FolioDuet</h1>'],
      '/privacy/': ['<h1>Privacy</h1>Updated'],
      '/terms/': ['<h1>Terms</h1>Updated'],
      '/qa-missing-route-20260915': ['Page not found', { status: 404 }],
      '/assets/qa-missing-20260915.js': ['Page not found', { status: 404 }],
      '/manifest.webmanifest': [JSON.stringify({ name: 'FolioDuet', icons: [{ src: '/icon.png' }] })],
      '/icon.png': ['image fixture', { headers: { 'content-type': 'image/png' } }],
      '/sw.js': ['self.addEventListener("fetch", () => {})', { headers: { 'content-type': 'text/javascript' } }],
      '/legacy': ['', { status: 308, headers: { location: `${origin}/?qa=redirect` } }],
      ...overrides,
    };
    if (!routes[path]) throw new Error(`Unexpected synthetic route: ${path}`);
    return new Response(...routes[path]);
  };
}

describe('read-only live QA checker', () => {
  it('passes the complete synthetic site and declares its limited scope', async () => {
    const { checkLive } = await import('./check-live.mjs');
    const result = await checkLive({ origin, legacyOrigin, fetchImpl: fakeSite() });
    expect(result.passed).toHaveLength(18); // fixture has one icon; production has two
    expect(result.scope).toContain('not a Google login');
    expect(JSON.stringify(result)).not.toContain(syntheticKey);
  });

  it.each([
    ['OAuth opener', { '/': ['FolioDuet'] }, 'OAuth popup opener'],
    ['HTML masquerading as JS', { '/assets/app.js': ['<!doctype html>', { headers: { 'content-type': 'text/html' } }] }, 'executable content'],
    ['wrong project', { '/config': [JSON.stringify({ projectId: 'wrong', authorizedDomains: required })] }, 'official project'],
    ['missing domain', { '/config': [JSON.stringify({ projectId: '263927058814', authorizedDomains: ['boxie.dionlabs.ai'] })] }, 'folioduet.dionlabs.ai'],
    ['SPA legal route', { '/privacy/': ['<div id="root"></div>'] }, 'readable static content'],
    ['soft 404', { '/qa-missing-route-20260915': ['Page not found'] }, 'real 404'],
    ['HTML icon', { '/icon.png': ['<html>', { headers: { 'content-type': 'text/html' } }] }, 'Manifest icon'],
    ['HTML worker', { '/sw.js': ['fetch', { headers: { 'content-type': 'text/html' } }] }, 'Service worker'],
    ['lost redirect query', { '/legacy': ['', { status: 308, headers: { location: origin } }] }, 'preserves the query'],
    ['unavailable script', { '/assets/app.js': ['unavailable', { status: 503 }] }, 'HTTP 503'],
  ])('rejects %s', async (_name, overrides, expected) => {
    const { checkLive } = await import('./check-live.mjs');
    await expect(checkLive({ origin, legacyOrigin, fetchImpl: fakeSite(overrides) })).rejects.toThrow(expected);
  });
});
