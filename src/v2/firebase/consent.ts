export type AnalyticsConsent = 'granted' | 'denied';

const CONSENT_KEY = 'pageecho-analytics-consent';

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    if (value === 'granted' || value === 'denied') return value;
    return null;
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(value: AnalyticsConsent): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // ignore quota / private mode
  }
  window.dispatchEvent(new CustomEvent('pageecho:analytics-consent', { detail: value }));
}

export function hasAnalyticsConsent(): boolean {
  return readAnalyticsConsent() === 'granted';
}
