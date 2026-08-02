import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFishVoiceTitle, formatFishVoiceLabel, peekFishVoiceTitle } from './fishVoice';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('formatFishVoiceLabel', () => {
  it('prefers voice title — provider', () => {
    expect(formatFishVoiceLabel('Sarah', '933563129e564b19a115bedd57b7406a')).toBe(
      'Sarah — Fish Audio',
    );
  });

  it('falls back to a shortened id when title is missing', () => {
    expect(formatFishVoiceLabel(null, '933563129e564b19a115bedd57b7406a')).toBe(
      'Fish Audio (93356312…)',
    );
  });
});

describe('fetchFishVoiceTitle', () => {
  it('reads title from the Fish model endpoint and caches it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Sarah', _id: 'abc' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: vi.fn(),
    });

    await expect(fetchFishVoiceTitle('abc')).resolves.toBe('Sarah');
    await expect(fetchFishVoiceTitle('abc')).resolves.toBe('Sarah');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(peekFishVoiceTitle('abc')).toBe('Sarah');
  });
});
