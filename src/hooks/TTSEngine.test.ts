import { afterEach, describe, expect, it, vi } from 'vitest';
import { countUsableWordTimestamps, splitTextForInworld, TTSEngine } from './TTSEngine';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('splitTextForInworld', () => {
  it('keeps every request below the conservative Inworld limit', () => {
    const text = Array.from(
      { length: 180 },
      (_, index) => `Sentence ${index} has enough words to exercise natural chunking. `,
    ).join('');

    const chunks = splitTextForInworld(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 1900)).toBe(true);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(text);
  });

  it('preserves exact character offsets across chunk boundaries', () => {
    const text = `${'First sentence. '.repeat(15)}${'Second sentence? '.repeat(15)}`;
    const chunks = splitTextForInworld(text, 120);

    chunks.forEach((chunk, index) => {
      expect(chunk.text).toBe(text.slice(chunk.startCharOffset, chunk.endCharOffset));
      expect(chunk.endCharOffset - chunk.startCharOffset).toBe(chunk.text.length);
      if (index > 0) {
        expect(chunk.startCharOffset).toBe(chunks[index - 1].endCharOffset);
      }
    });
  });

  it('prefers a sentence boundary over cutting through the next sentence', () => {
    const firstSentence = `${'A'.repeat(52)}. `;
    const secondSentence = `${'B'.repeat(45)}. `;
    const chunks = splitTextForInworld(`${firstSentence}${secondSentence}tail`, 80);

    expect(chunks[0].text).toBe(firstSentence);
  });

  it('hard-splits long unbroken text without losing content', () => {
    const text = 'x'.repeat(4501);
    const chunks = splitTextForInworld(text);

    expect(chunks.map((chunk) => chunk.text.length)).toEqual([1900, 1900, 701]);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(text);
  });

  it('does not split a surrogate pair at a normal chunk boundary', () => {
    const text = `${'a'.repeat(1899)}🟡${'b'.repeat(50)}`;
    const chunks = splitTextForInworld(text);

    expect(chunks[0].text.endsWith('🟡')).toBe(false);
    expect(chunks[1].text.startsWith('🟡')).toBe(true);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(text);
  });

  it('rejects invalid chunk lengths', () => {
    expect(() => splitTextForInworld('text', 0)).toThrow(
      'Inworld chunk length must be a positive integer.',
    );
  });
});

describe('countUsableWordTimestamps', () => {
  it('requires finite start/end pairs with end > start', () => {
    expect(countUsableWordTimestamps(undefined)).toBe(0);
    expect(countUsableWordTimestamps({
      wordAlignment: {
        words: ['True', '!'],
        wordStartTimeSeconds: [0, 0.2],
        wordEndTimeSeconds: [0.2, 0.2],
      },
    })).toBe(1);
  });
});

describe('TTSEngine cache keys', () => {
  it('keys neural cache by provider, voice, and text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        audioContent: 'YQ==',
        timestampInfo: {
          wordAlignment: {
            words: ['hi'],
            wordStartTimeSeconds: [0],
            wordEndTimeSeconds: [0.2],
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = new TTSEngine({
      inworldEnabled: true,
      inworldEndpoint: '/api/tts/synthesize',
      provider: 'fish-audio',
      fishAudioVoiceId: 'voice-a',
    });
    engine.preloadBlocks(['Same text'], 1);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    engine.updateConfig({ fishAudioVoiceId: 'voice-b' });
    engine.preloadBlocks(['Same text'], 1);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const bodies = fetchMock.mock.calls.map(([, request]) => (
      JSON.parse((request as RequestInit).body as string)
    ));
    expect(bodies[0].voiceId).toBe('voice-a');
    expect(bodies[1].voiceId).toBe('voice-b');
  });

  it('ignores primed catalog clips for a different provider/voice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        audioContent: 'YQ==',
        timestampInfo: {
          wordAlignment: {
            words: ['Hello'],
            wordStartTimeSeconds: [0],
            wordEndTimeSeconds: [0.3],
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = new TTSEngine({
      inworldEnabled: true,
      inworldEndpoint: '/api/tts/synthesize',
      provider: 'fish-audio',
      fishAudioVoiceId: 'voice-a',
    });
    engine.primeAudioCache([
      {
        text: 'Hello',
        provider: 'fish-audio',
        voiceId: 'other-voice',
        audioContent: 'YQ==',
        timestampInfo: {
          wordAlignment: {
            words: ['Hello'],
            wordStartTimeSeconds: [0],
            wordEndTimeSeconds: [0.3],
          },
        },
      },
    ]);
    engine.preloadBlocks(['Hello'], 1);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

describe('TTSEngine preloading', () => {
  it('warms Fish Audio blocks the same way as Inworld (cross-page look-ahead)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        audioContent: 'audio',
        timestampInfo: {
          wordAlignment: {
            words: ['Next'],
            wordStartTimeSeconds: [0],
            wordEndTimeSeconds: [0.2],
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = new TTSEngine({
      inworldEnabled: true,
      inworldEndpoint: '/api/tts/synthesize',
      provider: 'fish-audio',
      fishAudioVoiceId: 'voice-fish',
    });

    engine.preloadBlocks(['next page speech', 'later'], 2);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const bodies = fetchMock.mock.calls.map(([, request]) => (
      JSON.parse((request as RequestInit).body as string)
    ));
    expect(bodies[0].provider).toBe('fish-audio');
    expect(bodies[0].voiceId).toBe('voice-fish');
    expect(bodies[0].text).toBe('next page speech');
    expect(bodies[1].text).toBe('later');
  });

  it('warms only the first safe chunk of each upcoming block', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        audioContent: 'audio',
        timestampInfo: {
          wordAlignment: {
            words: ['Long'],
            wordStartTimeSeconds: [0],
            wordEndTimeSeconds: [0.2],
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = new TTSEngine({
      inworldEnabled: true,
      inworldEndpoint: '/api/tts/synthesize',
      inworldVoiceId: 'Ashley',
    });
    const longBlock = `${'Long sentence for preloading. '.repeat(100)}tail`;

    engine.preloadBlocks(['', longBlock, 'next page', 'outside budget'], 2);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const requestTexts = fetchMock.mock.calls.map(([, request]) => (
      JSON.parse((request as RequestInit).body as string).text as string
    ));
    expect(requestTexts[0].length).toBeLessThanOrEqual(1900);
    expect(longBlock.startsWith(requestTexts[0])).toBe(true);
    expect(requestTexts[1]).toBe('next page');
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toEqual({
      'Content-Type': 'application/json',
    });
  });
});
