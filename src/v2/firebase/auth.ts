import {
  GoogleAuthProvider,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from './app';
import { trackEvent } from './analytics';
import { isInsecureRemoteOrigin, resolveAuthDomain } from './config';
import { clearFirebaseAuthHandlerUrl } from './authUrl';
import { pageechoUserPath } from './paths';

const googleProvider = new GoogleAuthProvider();
const AUTH_ERROR_KEY = 'pe_auth_error';

export type GoogleSignInResult = {
  user: User | null;
  /** Set when an anonymous session could not be linked and we switched accounts. */
  previousAnonymousUid?: string;
};

export function consumeAuthError(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const value = sessionStorage.getItem(AUTH_ERROR_KEY);
  if (value) sessionStorage.removeItem(AUTH_ERROR_KEY);
  return value;
}

function storeAuthError(error: unknown): void {
  if (typeof sessionStorage === 'undefined') return;
  const message =
    error && typeof error === 'object' && 'code' in error
      ? `${String((error as { code?: string }).code)}: ${error instanceof Error ? error.message : 'Sign-in failed'}`
      : error instanceof Error
        ? error.message
        : 'Sign-in failed';
  sessionStorage.setItem(AUTH_ERROR_KEY, message);
}

function configuredProjectAuthDomain(): string {
  const value = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  return typeof value === 'string' && value.trim() ? value.trim() : 'dionlabs-fe92e.firebaseapp.com';
}

/** Same-origin authDomain means /__/auth is proxied on this host (redirect-safe). */
function hasSameOriginAuthHelper(): boolean {
  if (typeof window === 'undefined') return false;
  return resolveAuthDomain(configuredProjectAuthDomain()) === window.location.host;
}

function prefersRedirectSignIn(): boolean {
  if (typeof window === 'undefined') return false;
  // Redirect only works reliably with same-origin auth helper (Firebase Option 3).
  if (!hasSameOriginAuthHelper()) return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches === true;
  const narrow = window.matchMedia?.('(max-width: 900px)').matches === true;
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  return coarse || narrow || mobileUa;
}

function isPopupClosedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: string }).code) : '';
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}

function authErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: string }).code ?? '');
}

/** Convert Firebase's developer-facing auth errors into concise recovery guidance. */
export function getGoogleSignInErrorMessage(error: unknown): string | null {
  switch (authErrorCode(error)) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/network-request-failed':
      return 'Couldn’t reach Google. Check your connection, then try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups, then try again.';
    case 'auth/unauthorized-domain':
      return 'Google sign-in isn’t available on this domain yet.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is temporarily unavailable.';
    default:
      return 'Google sign-in didn’t finish. Please try again.';
  }
}

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  if (!isFirebaseConfigured()) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

/** Wait until Firebase has restored any persisted session (Google or anonymous). */
export async function waitForAuthReady(): Promise<User | null> {
  if (!isFirebaseConfigured()) return null;
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  return auth.currentUser;
}

/** Ensure every visitor has a uid (anonymous) so sync + catalog warm work without Google. */
export async function ensureAnonymousSession(): Promise<User | null> {
  if (!isFirebaseConfigured()) return null;
  const auth = getFirebaseAuth();
  // Never mint a guest over a session that persistence hasn't finished restoring.
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  const result = await signInAnonymously(auth);
  await ensureUserProfile(result.user).catch((error) => {
    console.warn('[FolioDuet] Anonymous profile sync failed', error);
  });
  await trackEvent('login', { method: 'anonymous' });
  return result.user;
}

/** Complete redirect sign-in after Google returns to the app. */
export async function completeGoogleRedirectIfPresent(): Promise<User | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const result = await getRedirectResult(getFirebaseAuth());
    if (!result?.user) {
      // Session may already be restored while the address bar is still on the helper.
      clearFirebaseAuthHandlerUrl();
      return null;
    }
    await ensureUserProfile(result.user).catch((error) => {
      console.warn('[FolioDuet] Profile sync failed after redirect login', error);
    });
    await trackEvent('login', {
      method: result.user.isAnonymous ? 'anonymous-redirect' : 'google-redirect',
    });
    if (!result.user.isAnonymous) {
      await trackEvent('signup_complete', { method: 'google' });
    }
    clearFirebaseAuthHandlerUrl();
    return result.user;
  } catch (error) {
    clearFirebaseAuthHandlerUrl();
    storeAuthError(error);
    throw error;
  }
}

async function finishGoogleUser(user: User): Promise<User> {
  await ensureUserProfile(user).catch((error) => {
    console.warn('[FolioDuet] Profile sync failed after Google login', error);
  });
  await trackEvent('login', { method: 'google' });
  await trackEvent('signup_complete', { method: 'google' });
  clearFirebaseAuthHandlerUrl();
  return user;
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const auth = getFirebaseAuth();
  const current = auth.currentUser;

  // Prefer linking so the anonymous uid (and library) are preserved.
  if (current?.isAnonymous) {
    try {
      if (prefersRedirectSignIn()) {
        await linkWithRedirect(current, googleProvider);
        return { user: null };
      }
      const linked = await linkWithPopup(current, googleProvider);
      return { user: await finishGoogleUser(linked.user) };
    } catch (error) {
      const code = authErrorCode(error);
      if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        const credential = GoogleAuthProvider.credentialFromError(error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
        if (credential) {
          const previousAnonymousUid = current.uid;
          const signedIn = await signInWithCredential(auth, credential);
          return {
            user: await finishGoogleUser(signedIn.user),
            previousAnonymousUid,
          };
        }
      }
      if (isPopupClosedError(error) && hasSameOriginAuthHelper()) {
        await linkWithRedirect(current, googleProvider);
        return { user: null };
      }
      throw error;
    }
  }

  if (prefersRedirectSignIn()) {
    await signInWithRedirect(auth, googleProvider);
    return { user: null }; // page navigates away
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { user: await finishGoogleUser(result.user) };
  } catch (error) {
    // Do NOT fall back to redirect unless same-origin auth helper is available.
    if (isPopupClosedError(error) && hasSameOriginAuthHelper()) {
      await signInWithRedirect(auth, googleProvider);
      return { user: null };
    }
    if (isPopupClosedError(error) && isInsecureRemoteOrigin()) {
      throw new Error(
        'Google sign-in was interrupted. On a phone over Tailscale, open the HTTPS MagicDNS URL (not the raw IP), then try again.',
      );
    }
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
  await trackEvent('logout');
  // Immediately mint a fresh anonymous session so the app stays usable.
  await ensureAnonymousSession().catch(() => undefined);
}

export async function ensureUserProfile(user: User): Promise<void> {
  const ref = doc(getFirebaseDb(), ...pageechoUserPath(user.uid));
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await setDoc(
      ref,
      {
        displayName: user.displayName ?? (user.isAnonymous ? 'Guest' : ''),
        email: user.email ?? null,
        photoURL: user.photoURL ?? null,
        isAnonymous: user.isAnonymous,
        updatedAt: Date.now(),
      },
      { merge: true },
    );
    return;
  }

  await setDoc(ref, {
    displayName: user.displayName ?? (user.isAnonymous ? 'Guest' : ''),
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    isAnonymous: user.isAnonymous,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    preferences: {
      appearance: 'dark',
      fontScale: 1,
      playbackRate: 1,
      volume: 1,
      ttsBufferAhead: 3,
      inworldEnabled: false,
      inworldVoiceId: 'Ashley',
      fishAudioEnabled: true,
      fishAudioVoiceId: '933563129e564b19a115bedd57b7406a',
    },
    activeDocumentId: null,
    // serverTimestamp kept for console readability; client also writes ms epochs.
    provisionedAt: serverTimestamp(),
  });
}
