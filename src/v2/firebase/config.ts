export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  measurementId?: string;
}

function requiredEnv(
  name:
    | 'VITE_FIREBASE_API_KEY'
    | 'VITE_FIREBASE_AUTH_DOMAIN'
    | 'VITE_FIREBASE_APP_ID',
): string {
  const value = import.meta.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing ${name}. Copy .env.example → .env.local and fill Firebase web config.`);
  }
  return value.trim();
}

function hostnameOf(host: string): string {
  return host.split(':')[0] ?? host;
}

function isIpHostname(hostname: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  // Rough IPv6 / bracketed hosts
  return hostname.includes(':');
}

/**
 * Prefer same-origin authDomain so signInWithRedirect works when browsers
 * block third-party cookies (Firebase Option 3 — proxy /__/auth).
 * Raw IP hosts can't be Firebase authorized domains, so keep project authDomain.
 */
export function resolveAuthDomain(configuredAuthDomain: string): string {
  if (typeof window === 'undefined') return configuredAuthDomain;
  const host = window.location.host;
  if (!host || isIpHostname(hostnameOf(host))) return configuredAuthDomain;
  return host;
}

/** Returns null when Firebase env is not configured (local single-user mode). */
export function readFirebaseConfig(): FirebaseWebConfig | null {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    return null;
  }

  const configuredAuthDomain = requiredEnv('VITE_FIREBASE_AUTH_DOMAIN');

  return {
    apiKey: requiredEnv('VITE_FIREBASE_API_KEY'),
    authDomain: resolveAuthDomain(configuredAuthDomain),
    projectId: projectId.trim(),
    appId: requiredEnv('VITE_FIREBASE_APP_ID'),
    measurementId:
      typeof import.meta.env.VITE_FIREBASE_MEASUREMENT_ID === 'string' &&
      import.meta.env.VITE_FIREBASE_MEASUREMENT_ID.trim() !== ''
        ? import.meta.env.VITE_FIREBASE_MEASUREMENT_ID.trim()
        : undefined,
  };
}

/** Intentionally public while Fish Audio remains free. */
export function readFishSponsorKey(): string {
  const value = import.meta.env.VITE_FISH_AUDIO_SPONSOR_KEY;
  return typeof value === 'string' ? value.trim() : '';
}

export function isInsecureRemoteOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const { protocol, hostname } = window.location;
  if (protocol === 'https:') return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
  return true;
}
