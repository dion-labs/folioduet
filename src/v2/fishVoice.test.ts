import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureFishVoiceModel,
  fetchFishVoiceTitle,
  formatFishVoiceLabel,
  listFishVoices,
  peekFishVoiceTitle,
} from './fishVoice';

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

describe('listFishVoices', () => {
  it('maps public model list items and caches titles', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            _id: 'voice-1',
            title: 'Sarah',
            description: 'An engaged speaker.',
            languages: ['en'],
            tags: ['female'],
          },
          { _id: 'bad', title: '' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: vi.fn(),
    });

    const voices = await listFishVoices({ force: true, pageSize: 10 });
    expect(voices).toEqual([
      {
        id: 'voice-1',
        title: 'Sarah',
        description: 'An engaged speaker.',
        languages: ['en'],
        tags: ['female'],
      },
    ]);
    expect(peekFishVoiceTitle('voice-1')).toBe('Sarah');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('sort_by=score');
  });
});

describe('ensureFishVoiceModel', () => {
  it('prepends the selected model when missing from the browse list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        _id: 'custom-id',
        title: 'Custom Narrator',
        description: 'Soft and clear.',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: vi.fn(),
    });

    const next = await ensureFishVoiceModel('custom-id', [
      {
        id: 'other',
        title: 'Other',
        description: '',
        languages: [],
        tags: [],
      },
    ]);
    expect(next[0]).toMatchObject({ id: 'custom-id', title: 'Custom Narrator' });
    expect(next).toHaveLength(2);
  });
});
