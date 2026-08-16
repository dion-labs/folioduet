import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTtsCacheKey, TtsCache } from './tts-cache.mjs';

const request = {
  text: 'A persistent sentence for FolioDuet.',
  voiceId: 'Ashley',
  modelId: 'inworld-tts-2',
  timestampType: 'WORD',
  audioConfig: {
    audioEncoding: 'MP3',
    sampleRateHertz: 22050,
  },
};

const timestampInfo = {
  wordAlignment: {
    words: ['A', 'persistent', 'sentence'],
    wordStartTimeSeconds: [0, 0.1, 0.4],
    wordEndTimeSeconds: [0.08, 0.35, 0.8],
  },
};

function inworldResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      audioContent: Buffer.from('fake-mp3-audio').toString('base64'),
      timestampInfo,
    }),
  };
}

const openCaches = [];
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.allSettled(openCaches.splice(0).map((cache) => cache.close()));
  await Promise.allSettled(
    temporaryDirectories.splice(0).map((directory) => rm(directory, {
      recursive: true,
      force: true,
    })),
  );
});

async function createTemporaryCache(options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pageecho-cache-'));
  temporaryDirectories.push(dataDir);
  const cache = new TtsCache({ dataDir, ...options });
  openCaches.push(cache);
  await cache.ready;
  return { cache, dataDir };
}

describe('TtsCache', () => {
  it('persists MP3 audio, timestamps, and SQLite metadata across restarts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(inworldResponse());
    const { cache, dataDir } = await createTemporaryCache({
      apiKey: 'credential',
      fetchImpl,
      now: () => 1000,
    });

    const miss = await cache.synthesize(request);
    expect(miss.cacheStatus).toBe('miss');
    expect(miss.timestampInfo).toEqual(timestampInfo);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await cache.close();
    openCaches.splice(openCaches.indexOf(cache), 1);

    const offlineFetch = vi.fn(() => {
      throw new Error('A persistent cache hit must not call Inworld.');
    });
    const reopened = new TtsCache({
      dataDir,
      apiKey: '',
      fetchImpl: offlineFetch,
      now: () => 2000,
    });
    openCaches.push(reopened);
    await reopened.ready;

    const hit = await reopened.synthesize(request);
    expect(hit.cacheStatus).toBe('hit');
    expect(hit.audioContent).toBe(miss.audioContent);
    expect(hit.timestampInfo).toEqual(timestampInfo);
    expect(offlineFetch).not.toHaveBeenCalled();
    expect(await reopened.getStats()).toEqual({
      entries: 1,
      audioBytes: Buffer.byteLength('fake-mp3-audio'),
      cacheHits: 1,
      lastAccessedAt: 2000,
    });

    const storedFiles = await readdir(dataDir, { recursive: true });
    expect(storedFiles.some((file) => file.endsWith('.mp3'))).toBe(true);
    expect(storedFiles.some((file) => file.endsWith('.timestamps.json'))).toBe(true);
    expect(storedFiles.some((file) => file.endsWith('pageecho.sqlite'))).toBe(true);
  });

  it('deduplicates simultaneous cache misses for the same chunk', async () => {
    const fetchImpl = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return inworldResponse();
    });
    const { cache } = await createTemporaryCache({
      apiKey: 'credential',
      fetchImpl,
    });

    const [first, second] = await Promise.all([
      cache.synthesize(request),
      cache.synthesize(request),
    ]);

    expect(first.cacheKey).toBe(second.cacheKey);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('separates cache entries by voice and text', () => {
    expect(createTtsCacheKey(request)).not.toBe(createTtsCacheKey({
      ...request,
      voiceId: 'Dennis',
    }));
    expect(createTtsCacheKey(request)).not.toBe(createTtsCacheKey({
      ...request,
      text: `${request.text} Again.`,
    }));
  });

  it('serves existing entries without a credential but rejects new misses', async () => {
    const { cache } = await createTemporaryCache({
      apiKey: '',
      fetchImpl: vi.fn(),
    });

    await expect(cache.synthesize(request)).rejects.toMatchObject({
      code: 'INWORLD_NOT_CONFIGURED',
      statusCode: 503,
    });
  });

  it('rejects oversized chunks before contacting Inworld', async () => {
    const fetchImpl = vi.fn();
    const { cache } = await createTemporaryCache({
      apiKey: 'credential',
      fetchImpl,
    });

    await expect(cache.synthesize({
      ...request,
      text: 'x'.repeat(2001),
    })).rejects.toMatchObject({
      code: 'TEXT_TOO_LONG',
      statusCode: 400,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('supports Fish Audio synthesis and caching', async () => {
    async function* makeBody() {
      const events = [
        'data: {"audio_base64": "ZmFrZS1tcDMtYXVkaW8=", "chunk_seq": 0, "chunk_audio_offset_sec": 0.0, "alignment": {"segments": [{"text": "A", "start": 0, "end": 0.08}, {"text": "persistent", "start": 0.1, "end": 0.35}]}}\n\n',
      ];
      for (const event of events) {
        yield new TextEncoder().encode(event);
      }
    }

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeBody(),
    });

    const { cache } = await createTemporaryCache({
      fishAudioApiKey: 'fish-credential',
      fetchImpl,
      now: () => 3000,
    });

    const fishRequest = {
      provider: 'fish-audio',
      text: 'A persistent sentence.',
      voiceId: 'Ashley',
      modelId: 's2.1-pro',
    };

    const miss = await cache.synthesize(fishRequest);
    expect(miss.cacheStatus).toBe('miss');
    expect(miss.timestampInfo).toEqual({
      wordAlignment: {
        words: ['A', 'persistent'],
        wordStartTimeSeconds: [0, 0.1],
        wordEndTimeSeconds: [0.08, 0.35],
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const hit = await cache.synthesize(fishRequest);
    expect(hit.cacheStatus).toBe('hit');
    expect(hit.timestampInfo).toEqual({
      wordAlignment: {
        words: ['A', 'persistent'],
        wordStartTimeSeconds: [0, 0.1],
        wordEndTimeSeconds: [0.08, 0.35],
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
