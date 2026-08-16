import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logEvent: vi.fn(),
  getFirebaseAnalytics: vi.fn(),
  isFirebaseConfigured: vi.fn(),
  hasAnalyticsConsent: vi.fn(),
}));

vi.mock('firebase/analytics', () => ({ logEvent: mocks.logEvent }));
vi.mock('./app', () => ({
  getFirebaseAnalytics: mocks.getFirebaseAnalytics,
  isFirebaseConfigured: mocks.isFirebaseConfigured,
}));
vi.mock('./consent', () => ({ hasAnalyticsConsent: mocks.hasAnalyticsConsent }));

import { activationAnalytics, trackEvent } from './analytics';

describe('analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFirebaseConfigured.mockReturnValue(true);
    mocks.hasAnalyticsConsent.mockReturnValue(true);
    mocks.getFirebaseAnalytics.mockResolvedValue({ app: {} });
  });

  it('does not initialize or log Firebase Analytics without consent', async () => {
    mocks.hasAnalyticsConsent.mockReturnValue(false);
    await activationAnalytics.demoStart();
    expect(mocks.getFirebaseAnalytics).not.toHaveBeenCalled();
    expect(mocks.logEvent).not.toHaveBeenCalled();
  });

  it('emits the typed activation event taxonomy', async () => {
    await activationAnalytics.demoStart('first_run');
    await activationAnalytics.demo30Seconds('reader');
    await activationAnalytics.importOpen('empty_library');
    await activationAnalytics.importSuccess('pdf', 12.8);
    await activationAnalytics.importFailure('parse_error', 'pdf');
    await activationAnalytics.ownDocumentPlaybackStart('pdf', 'fish');
    await activationAnalytics.ownDocumentListened3Minutes('pdf', 'fish');
    await activationAnalytics.signupPromptShown('account');
    await activationAnalytics.signupComplete('google');

    expect(mocks.logEvent.mock.calls.map((call) => call[1])).toEqual([
      'demo_start',
      'demo_30s',
      'import_open',
      'import_success',
      'import_failure',
      'own_document_playback_start',
      'own_document_listened_3m',
      'signup_prompt_shown',
      'signup_complete',
    ]);
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.anything(),
      'import_success',
      { document_kind: 'pdf', page_count: 12 },
    );
  });

  it('drops sensitive keys, email-like values, and invalid event names', async () => {
    await trackEvent('safe_event', {
      filename: 'private.pdf',
      document_id: 'secret-id',
      campaign: 'jane@example.com',
      provider: 'fish',
    });
    await trackEvent('Invalid Event', { provider: 'fish' });

    expect(mocks.logEvent).toHaveBeenCalledTimes(1);
    expect(mocks.logEvent).toHaveBeenCalledWith(
      expect.anything(),
      'safe_event',
      { provider: 'fish' },
    );
  });
});
