import { logEvent } from 'firebase/analytics';
import { getFirebaseAnalytics, isFirebaseConfigured } from './app';
import { hasAnalyticsConsent } from './consent';
import {
  captureCurrentAttribution,
  recordReturnVisit,
  resolveFirstTouchAttribution,
  type FirstTouchAttribution,
} from './attribution';

export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

export type ActivationSurface = 'first_run' | 'empty_library' | 'reader' | 'account' | 'other';
export type DocumentKind = 'pdf' | 'markdown_zip' | 'other';
export type ImportFailureReason =
  | 'unsupported_type'
  | 'parse_error'
  | 'empty_document'
  | 'storage_error'
  | 'cancelled'
  | 'unknown';
export type TtsProvider = 'fish' | 'inworld' | 'system' | 'other';

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const SENSITIVE_PARAM_PATTERN = /^(?:email|file|file_name|filename|name|title|text|book_text|uid|user_id|document_id|book_id|full_url)$/i;
const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;

function cleanAnalyticsParams(params: AnalyticsParams): Record<string, string | number | boolean> {
  const cleaned: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || SENSITIVE_PARAM_PATTERN.test(key)) continue;
    if (typeof value === 'string') {
      const safe = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
      if (!safe || EMAIL_PATTERN.test(safe)) continue;
      cleaned[key] = safe.slice(0, 100);
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) cleaned[key] = value;
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Thin façade over Firebase Analytics.
 * Events only fire after the user grants consent (GDPR/ePrivacy).
 * Crashlytics is not exported from firebase@12 web SDK yet — use `reportError`
 * (Analytics `exception` + console) until the web export lands.
 */
export async function trackEvent(name: string, params: AnalyticsParams = {}): Promise<void> {
  if (!EVENT_NAME_PATTERN.test(name) || !isFirebaseConfigured() || !hasAnalyticsConsent()) return;
  try {
    const analytics = await getFirebaseAnalytics();
    if (!analytics) return;
    logEvent(analytics, name, cleanAnalyticsParams(params));
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
  console.error('[FolioDuet]', message, error);

  const { fatal: _fatal, ...rest } = context;
  await trackEvent('exception', {
    // Error messages can contain filenames, URLs, or extracted book text.
    // Keep the full value in the local console only.
    error_name: error instanceof Error ? error.name : 'UnknownError',
    fatal,
    ...rest,
  });
}

function attributionParams(attribution: FirstTouchAttribution): AnalyticsParams {
  return {
    first_touch_source: attribution.source,
    first_touch_medium: attribution.medium,
    first_touch_campaign: attribution.campaign,
    first_touch_term: attribution.term,
    first_touch_content: attribution.content,
    first_touch_referrer_host: attribution.referrerHost,
    first_touch_landing_path: attribution.landingPath,
  };
}

async function trackLandingView(candidate: FirstTouchAttribution): Promise<void> {
  if (!hasAnalyticsConsent() || typeof window === 'undefined') return;

  const firstTouch = resolveFirstTouchAttribution(candidate, window.localStorage);
  const visit = recordReturnVisit(window.localStorage, window.sessionStorage);
  if (!visit) return;

  await trackEvent('landing_view', {
    ...attributionParams(firstTouch),
    visitor_type: visit.isFirstVisit ? 'first_time' : 'returning',
    visit_number: visit.visitNumber,
    days_since_first_visit: visit.daysSinceFirstVisit,
  });

  if (!visit.isFirstVisit) {
    await trackEvent('return_visit', {
      visit_number: visit.visitNumber,
      days_since_first_visit: visit.daysSinceFirstVisit,
    });
  }
  if (visit.day1Due) await trackEvent('return_day_1');
  if (visit.day7Due) await trackEvent('return_day_7');
}

/**
 * Capture the initial attribution in memory immediately, then emit the landing
 * event only once consent exists. Returns an event-listener cleanup function.
 */
export function installActivationAnalytics(): () => void {
  if (typeof window === 'undefined') return () => {};
  const initialAttribution = captureCurrentAttribution();
  void trackLandingView(initialAttribution);

  const onConsent = (event: Event) => {
    if ((event as CustomEvent).detail === 'granted') {
      void trackLandingView(initialAttribution);
    }
  };
  window.addEventListener('pageecho:analytics-consent', onConsent);
  return () => window.removeEventListener('pageecho:analytics-consent', onConsent);
}

/** Typed, PII-free funnel calls for UI and playback integration points. */
export const activationAnalytics = {
  landingView: async (): Promise<void> => trackLandingView(captureCurrentAttribution()),
  demoStart: async (surface: ActivationSurface = 'first_run'): Promise<void> =>
    trackEvent('demo_start', { surface }),
  demo30Seconds: async (surface: ActivationSurface = 'reader'): Promise<void> =>
    trackEvent('demo_30s', { surface }),
  importOpen: async (surface: ActivationSurface = 'empty_library'): Promise<void> =>
    trackEvent('import_open', { surface }),
  importSuccess: async (kind: DocumentKind, pageCount?: number): Promise<void> =>
    trackEvent('import_success', {
      document_kind: kind,
      page_count: pageCount === undefined ? undefined : Math.max(0, Math.floor(pageCount)),
    }),
  importFailure: async (reason: ImportFailureReason, kind?: DocumentKind): Promise<void> =>
    trackEvent('import_failure', { reason, document_kind: kind }),
  ownDocumentPlaybackStart: async (
    kind: DocumentKind,
    provider?: TtsProvider,
  ): Promise<void> => trackEvent('own_document_playback_start', {
    document_kind: kind,
    tts_provider: provider,
  }),
  ownDocumentListened3Minutes: async (
    kind: DocumentKind,
    provider?: TtsProvider,
  ): Promise<void> => trackEvent('own_document_listened_3m', {
    document_kind: kind,
    tts_provider: provider,
  }),
  signupPromptShown: async (surface: ActivationSurface = 'account'): Promise<void> =>
    trackEvent('signup_prompt_shown', { surface }),
  signupComplete: async (method: 'google' | 'other' = 'google'): Promise<void> =>
    trackEvent('signup_complete', { method }),
};

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
