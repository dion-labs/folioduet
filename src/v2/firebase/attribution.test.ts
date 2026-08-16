import { describe, expect, it } from 'vitest';
import {
  deriveAttribution,
  recordReturnVisit,
  resolveFirstTouchAttribution,
} from './attribution';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('attribution', () => {
  it('captures bounded UTM fields and only the referrer hostname', () => {
    expect(deriveAttribution(
      'https://folioduet.dionlabs.ai/?utm_source=x&utm_medium=social&utm_campaign=launch&utm_content=video#reader',
      'https://news.ycombinator.com/item?id=123',
    )).toEqual({
      source: 'x',
      medium: 'social',
      campaign: 'launch',
      term: undefined,
      content: 'video',
      referrerHost: 'news.ycombinator.com',
      landingPath: '/',
    });
  });

  it('derives referral/direct traffic and drops dynamic-looking paths', () => {
    expect(deriveAttribution('https://folioduet.dionlabs.ai/read/jane@example.com', ''))
      .toMatchObject({ source: 'direct', medium: 'none', landingPath: '/' });
    expect(deriveAttribution('https://folioduet.dionlabs.ai/v2', 'https://google.com/search?q=pdf'))
      .toMatchObject({ source: 'google.com', medium: 'referral', landingPath: '/v2' });
  });

  it('attributes clean branded campaign paths without visible UTM parameters', () => {
    expect(deriveAttribution('https://folioduet.dionlabs.ai/x', '')).toMatchObject({
      source: 'x',
      medium: 'social',
      campaign: 'launch',
      landingPath: '/x',
    });
    expect(deriveAttribution('https://folioduet.dionlabs.ai/x-update', '')).toMatchObject({
      source: 'x',
      medium: 'social',
      campaign: 'rename',
      landingPath: '/x-update',
    });
    expect(deriveAttribution('https://folioduet.dionlabs.ai/fish', '')).toMatchObject({
      source: 'fishaudio',
      medium: 'community',
      campaign: 'activation_launch',
      landingPath: '/fish',
    });
    expect(deriveAttribution('https://folioduet.dionlabs.ai/hermes', '')).toMatchObject({
      source: 'hermes',
      medium: 'community',
      campaign: 'activation_launch',
      landingPath: '/hermes',
    });
  });

  it('lets explicit UTM values override a campaign path', () => {
    expect(deriveAttribution(
      'https://folioduet.dionlabs.ai/x?utm_source=manual&utm_medium=test&utm_campaign=override',
      '',
    )).toMatchObject({
      source: 'manual',
      medium: 'test',
      campaign: 'override',
      landingPath: '/x',
    });
  });

  it('keeps the original first touch on later visits', () => {
    const storage = memoryStorage();
    const first = deriveAttribution('https://folioduet.dionlabs.ai/?utm_source=fish');
    const later = deriveAttribution('https://folioduet.dionlabs.ai/?utm_source=google');

    expect(resolveFirstTouchAttribution(first, storage)).toEqual(first);
    expect(resolveFirstTouchAttribution(later, storage)).toEqual(first);
  });
});

describe('return visit signals', () => {
  const day = 24 * 60 * 60 * 1_000;

  it('emits first, day-1, and day-7 signals once across sessions', () => {
    const persistent = memoryStorage();
    const firstSession = memoryStorage();
    const start = Date.UTC(2026, 7, 1, 12);

    expect(recordReturnVisit(persistent, firstSession, start)).toEqual({
      isFirstVisit: true,
      visitNumber: 1,
      daysSinceFirstVisit: 0,
      day1Due: false,
      day7Due: false,
    });
    expect(recordReturnVisit(persistent, firstSession, start)).toBeNull();

    expect(recordReturnVisit(persistent, memoryStorage(), start + day)).toMatchObject({
      isFirstVisit: false,
      visitNumber: 2,
      daysSinceFirstVisit: 1,
      day1Due: true,
      day7Due: false,
    });
    expect(recordReturnVisit(persistent, memoryStorage(), start + 8 * day)).toMatchObject({
      visitNumber: 3,
      day1Due: false,
      day7Due: true,
    });
    expect(recordReturnVisit(persistent, memoryStorage(), start + 9 * day)).toMatchObject({
      visitNumber: 4,
      day1Due: false,
      day7Due: false,
    });
  });
});
