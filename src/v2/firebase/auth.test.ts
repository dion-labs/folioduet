import { describe, expect, it } from 'vitest';
import { getGoogleSignInErrorMessage } from './auth';

function authError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe('getGoogleSignInErrorMessage', () => {
  it('turns a network failure into retry guidance', () => {
    expect(getGoogleSignInErrorMessage(authError('auth/network-request-failed')))
      .toBe('Couldn’t reach Google. Check your connection, then try again.');
  });

  it('does not treat closing the popup as an error', () => {
    expect(getGoogleSignInErrorMessage(authError('auth/popup-closed-by-user'))).toBeNull();
  });

  it('uses a safe generic message for unexpected failures', () => {
    expect(getGoogleSignInErrorMessage(new Error('internal details')))
      .toBe('Google sign-in didn’t finish. Please try again.');
  });
});
