/**
 * Firebase popup/redirect helper can leave the SPA on `/__/auth/handler?...`.
 * Once auth is done (or the session is already restored), collapse that to `/`.
 */
export function clearFirebaseAuthHandlerUrl(
  location: Pick<Location, 'pathname' | 'hash'> = typeof window !== 'undefined'
    ? window.location
    : { pathname: '/', hash: '' },
  replaceState: (url: string) => void = (url) => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(window.history.state, '', url);
  },
): boolean {
  if (!location.pathname.includes('/__/auth')) return false;
  const hash = location.hash && location.hash !== '#' ? location.hash : '';
  replaceState(hash ? `/${hash}` : '/');
  return true;
}
