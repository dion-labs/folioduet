import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, type Analytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { readFirebaseConfig, type FirebaseWebConfig } from './config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let analytics: Analytics | null = null;
let analyticsInit: Promise<Analytics | null> | null = null;

export function isFirebaseConfigured(): boolean {
  return readFirebaseConfig() !== null;
}

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const config = readFirebaseConfig();
  if (!config) {
    throw new Error('Firebase is not configured.');
  }
  app = initializeApp(config as FirebaseWebConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  const firebaseApp = getFirebaseApp();
  try {
    auth = initializeAuth(firebaseApp, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // Hot reload / second init
    auth = getAuth(firebaseApp);
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (db) return db;
  db = getFirestore(getFirebaseApp());
  return db;
}

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  // Lazy-init only after consent — importing/initializing Analytics can set cookies.
  const { hasAnalyticsConsent } = await import('./consent');
  if (!hasAnalyticsConsent()) return null;

  if (analytics) return analytics;
  if (analyticsInit) return analyticsInit;

  analyticsInit = (async () => {
    if (!hasAnalyticsConsent()) return null;
    const config = readFirebaseConfig();
    if (!config?.measurementId) return null;
    if (!(await isAnalyticsSupported())) return null;
    analytics = getAnalytics(getFirebaseApp());
    return analytics;
  })();

  return analyticsInit;
}
