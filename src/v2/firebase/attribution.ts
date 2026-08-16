export type FirstTouchAttribution = Readonly<{
  source: string;
  medium: string;
  campaign?: string;
  term?: string;
  content?: string;
  referrerHost?: string;
  landingPath: string;
}>;

export type ReturnVisitSignals = Readonly<{
  isFirstVisit: boolean;
  visitNumber: number;
  daysSinceFirstVisit: number;
  day1Due: boolean;
  day7Due: boolean;
}>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type VisitState = {
  firstSeenAt: number;
  visitNumber: number;
  day1Reported: boolean;
  day7Reported: boolean;
};

const FIRST_TOUCH_KEY = 'pageecho-analytics-first-touch-v1';
const VISIT_STATE_KEY = 'pageecho-analytics-visit-state-v1';
const SESSION_DATE_KEY = 'pageecho-analytics-session-date-v1';
const MAX_CAMPAIGN_VALUE_LENGTH = 100;
const DAY_MS = 24 * 60 * 60 * 1_000;

const CAMPAIGN_PATHS: Readonly<Record<string, Readonly<{
  source: string;
  medium: string;
  campaign: string;
}>>> = {
  '/x': { source: 'x', medium: 'social', campaign: 'launch' },
  '/x-update': { source: 'x', medium: 'social', campaign: 'rename' },
  '/fish': { source: 'fishaudio', medium: 'community', campaign: 'activation_launch' },
  '/hermes': { source: 'hermes', medium: 'community', campaign: 'activation_launch' },
};

function cleanCampaignValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(cleaned)) return undefined;
  return cleaned.slice(0, MAX_CAMPAIGN_VALUE_LENGTH);
}

function safeLandingPath(pathname: string): string {
  const cleaned = pathname.trim().slice(0, 100);
  // FolioDuet has static routes. Refuse dynamic-looking paths rather than risk
  // collecting an identifier accidentally placed in a URL.
  if (!/^\/[a-z0-9/_-]*$/i.test(cleaned) || /@/.test(cleaned)) return '/';
  return cleaned || '/';
}

function safeReferrerHost(referrer: string, currentHost: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).hostname.toLowerCase().slice(0, 100);
    if (!host || host === currentHost.toLowerCase()) return undefined;
    return host;
  } catch {
    return undefined;
  }
}

/**
 * Derive attribution without storing anything. This is safe to call before
 * consent so the initial URL can be held in memory until consent is granted.
 */
export function deriveAttribution(url: string, referrer = ''): FirstTouchAttribution {
  let parsed: URL;
  try {
    parsed = new URL(url, 'https://pageecho.invalid/');
  } catch {
    parsed = new URL('https://pageecho.invalid/');
  }

  const referrerHost = safeReferrerHost(referrer, parsed.hostname);
  const utmSource = cleanCampaignValue(parsed.searchParams.get('utm_source'));
  const utmMedium = cleanCampaignValue(parsed.searchParams.get('utm_medium'));
  const landingPath = safeLandingPath(parsed.pathname);
  const campaignPath = CAMPAIGN_PATHS[landingPath];

  return {
    source: utmSource ?? campaignPath?.source ?? referrerHost ?? 'direct',
    medium: utmMedium ?? campaignPath?.medium ?? (referrerHost ? 'referral' : 'none'),
    campaign: cleanCampaignValue(parsed.searchParams.get('utm_campaign')) ?? campaignPath?.campaign,
    term: cleanCampaignValue(parsed.searchParams.get('utm_term')),
    content: cleanCampaignValue(parsed.searchParams.get('utm_content')),
    referrerHost,
    landingPath,
  };
}

export function captureCurrentAttribution(): FirstTouchAttribution {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return deriveAttribution('https://pageecho.invalid/');
  }
  return deriveAttribution(window.location.href, document.referrer);
}

function parseFirstTouch(value: string | null): FirstTouchAttribution | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<FirstTouchAttribution>;
    if (
      typeof parsed.source !== 'string'
      || typeof parsed.medium !== 'string'
      || typeof parsed.landingPath !== 'string'
    ) return null;
    return {
      source: parsed.source.slice(0, 100),
      medium: parsed.medium.slice(0, 100),
      campaign: typeof parsed.campaign === 'string' ? parsed.campaign.slice(0, 100) : undefined,
      term: typeof parsed.term === 'string' ? parsed.term.slice(0, 100) : undefined,
      content: typeof parsed.content === 'string' ? parsed.content.slice(0, 100) : undefined,
      referrerHost: typeof parsed.referrerHost === 'string' ? parsed.referrerHost.slice(0, 100) : undefined,
      landingPath: safeLandingPath(parsed.landingPath),
    };
  } catch {
    return null;
  }
}

/** Persist once and always return the original first-touch attribution. */
export function resolveFirstTouchAttribution(
  candidate: FirstTouchAttribution,
  storage: StorageLike,
): FirstTouchAttribution {
  try {
    const existing = parseFirstTouch(storage.getItem(FIRST_TOUCH_KEY));
    if (existing) return existing;
    storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(candidate));
  } catch {
    // Storage can be unavailable in private modes. The current touch remains useful.
  }
  return candidate;
}

function utcDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function parseVisitState(value: string | null): VisitState | null {
  if (!value) return null;
  try {
    const state = JSON.parse(value) as Partial<VisitState>;
    if (
      typeof state.firstSeenAt !== 'number'
      || !Number.isFinite(state.firstSeenAt)
      || typeof state.visitNumber !== 'number'
    ) return null;
    return {
      firstSeenAt: state.firstSeenAt,
      visitNumber: Math.max(1, Math.floor(state.visitNumber)),
      day1Reported: state.day1Reported === true,
      day7Reported: state.day7Reported === true,
    };
  } catch {
    return null;
  }
}

/**
 * Record at most one visit per UTC day in a browser session and derive coarse
 * day-1/day-7 retention signals. No persistent visitor identifier is created.
 */
export function recordReturnVisit(
  persistentStorage: StorageLike,
  sessionStorage: StorageLike,
  now = Date.now(),
): ReturnVisitSignals | null {
  const today = utcDateKey(now);
  try {
    if (sessionStorage.getItem(SESSION_DATE_KEY) === today) return null;
    sessionStorage.setItem(SESSION_DATE_KEY, today);
  } catch {
    // Continue without session de-duplication when storage is unavailable.
  }

  let existing: VisitState | null = null;
  try {
    existing = parseVisitState(persistentStorage.getItem(VISIT_STATE_KEY));
  } catch {
    // Treat blocked storage as a first visit.
  }

  const isFirstVisit = existing === null;
  const daysSinceFirstVisit = existing
    ? Math.max(0, Math.floor((now - existing.firstSeenAt) / DAY_MS))
    : 0;
  const day7Due = daysSinceFirstVisit >= 7 && existing?.day7Reported === false;
  const day1Due = existing?.day1Reported === false
    && daysSinceFirstVisit >= 1
    && daysSinceFirstVisit < 7;
  const next: VisitState = {
    firstSeenAt: existing?.firstSeenAt ?? now,
    visitNumber: (existing?.visitNumber ?? 0) + 1,
    day1Reported: (existing?.day1Reported ?? false) || day1Due,
    day7Reported: (existing?.day7Reported ?? false) || day7Due,
  };

  try {
    persistentStorage.setItem(VISIT_STATE_KEY, JSON.stringify(next));
  } catch {
    // The event can still be emitted, but retention will not persist.
  }

  return {
    isFirstVisit,
    visitNumber: next.visitNumber,
    daysSinceFirstVisit,
    day1Due,
    day7Due,
  };
}
