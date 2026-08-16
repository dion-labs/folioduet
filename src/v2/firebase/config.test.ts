import { describe, expect, it } from 'vitest';
import { authProxyEnabled, resolveAuthDomain } from './config';

describe('authProxyEnabled', () => {
  it('is on in Vite DEV', () => {
    expect(authProxyEnabled({ DEV: true })).toBe(true);
  });

  it('is off in production unless explicitly opted in', () => {
    expect(authProxyEnabled({ DEV: false })).toBe(false);
    expect(authProxyEnabled({ DEV: false, VITE_FIREBASE_AUTH_PROXY: 'true' })).toBe(true);
  });
});

describe('resolveAuthDomain', () => {
  it('keeps the Firebase authDomain when no auth helper proxy is available', () => {
    expect(
      resolveAuthDomain('dionlabs-fe92e.firebaseapp.com', {
        host: 'folioduet.dionlabs.ai',
        proxyEnabled: false,
      }),
    ).toBe('dionlabs-fe92e.firebaseapp.com');
  });

  it('rewrites to the site host when /__/auth is proxied', () => {
    expect(
      resolveAuthDomain('dionlabs-fe92e.firebaseapp.com', {
        host: 'folioduet.dionlabs.ai',
        proxyEnabled: true,
      }),
    ).toBe('folioduet.dionlabs.ai');
  });

  it('never rewrites raw IP hosts', () => {
    expect(
      resolveAuthDomain('dionlabs-fe92e.firebaseapp.com', {
        host: '100.64.1.2:5173',
        proxyEnabled: true,
      }),
    ).toBe('dionlabs-fe92e.firebaseapp.com');
  });
});
