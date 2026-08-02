import { logEvent } from 'firebase/analytics';
import { getFirebaseAnalytics, isFirebaseConfigured } from './app';
import { hasAnalyticsConsent } from './consent';

export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

/**
 * Thin façade over Firebase Analytics.
 * Events only fire after the user grants consent (GDPR/ePrivacy).
 * Crashlytics is not exported from firebase@12 web SDK yet — use `reportError`
 * (Analytics `exception` + console) until the web export lands.
 */
export async function trackEvent(name: string, params: AnalyticsParams = {}): Promise<void> {
  if (!isFirebaseConfigured() || !hasAnalyticsConsent()) return;
  try {
    const analytics = await getFirebaseAnalytics();
    if (!analytics) return;
    const cleaned: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) cleaned[key] = value;
    }
    logEvent(analytics, name, cleaned);
  } catch {
    // Analytics must never break the reader.
  }
}

export async function reportError(
  error: unknown,
  context: AnalyticsParams & { fatal?: boolean } = {},
): Promise<void> {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  const fatal = context.fatal === true;
  console.error('[PageEcho]', message, error);

  const { fatal: _fatal, ...rest } = context;
  await trackEvent('exception', {
    description: message.slice(0, 100),
    fatal,
    ...rest,
  });
}

export function installGlobalErrorReporting(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onError = (event: ErrorEvent) => {
    void reportError(event.error ?? event.message, { fatal: true, source: 'window.error' });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    void reportError(event.reason, { fatal: false, source: 'unhandledrejection' });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
