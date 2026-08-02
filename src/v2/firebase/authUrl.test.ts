import { describe, expect, it, vi } from 'vitest';
import { clearFirebaseAuthHandlerUrl } from './authUrl';

describe('clearFirebaseAuthHandlerUrl', () => {
  it('replaces Firebase auth helper paths with /', () => {
    const replaceState = vi.fn();
    expect(
      clearFirebaseAuthHandlerUrl(
        { pathname: '/__/auth/handler', hash: '' },
        replaceState,
      ),
    ).toBe(true);
    expect(replaceState).toHaveBeenCalledWith('/');
  });

  it('keeps app hashes when clearing the auth helper path', () => {
    const replaceState = vi.fn();
    clearFirebaseAuthHandlerUrl(
      { pathname: '/__/auth/handler', hash: '#terms' },
      replaceState,
    );
    expect(replaceState).toHaveBeenCalledWith('/#terms');
  });

  it('leaves normal app URLs alone', () => {
    const replaceState = vi.fn();
    expect(
      clearFirebaseAuthHandlerUrl(
        { pathname: '/', hash: '#abc' },
        replaceState,
      ),
    ).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });
});
