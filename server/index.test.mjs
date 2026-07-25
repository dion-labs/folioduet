import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPageEchoServer } from './index.mjs';

const openServers = [];

afterEach(async () => {
  await Promise.allSettled(openServers.splice(0).map(
    (server) => new Promise((resolve) => server.close(resolve)),
  ));
});

async function startTestServer(cache) {
  const server = createPageEchoServer({
    cache,
    distDirectory: '/directory/that/does/not/exist',
  });
  openServers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

describe('PageEcho cache HTTP API', () => {
  it('reports health and cache statistics', async () => {
    const cache = {
      isConfigured: true,
      getStats: vi.fn().mockResolvedValue({
        entries: 4,
        audioBytes: 2048,
        cacheHits: 7,
        lastAccessedAt: 1234,
      }),
    };
    const origin = await startTestServer(cache);

    await expect(fetch(`${origin}/api/health`).then((response) => response.json()))
      .resolves.toEqual({ ok: true, inworldConfigured: true });
    await expect(fetch(`${origin}/api/tts/cache/stats`).then((response) => response.json()))
      .resolves.toEqual({
        entries: 4,
        audioBytes: 2048,
        cacheHits: 7,
        lastAccessedAt: 1234,
      });
  });

  it('returns audio, timestamps, and observable hit/miss status', async () => {
    const cache = {
      isConfigured: true,
      synthesize: vi.fn().mockResolvedValue({
        audioContent: 'encoded-audio',
        timestampInfo: { wordAlignment: { words: ['Cached'] } },
        cacheKey: 'cache-key',
        cacheStatus: 'hit',
      }),
    };
    const origin = await startTestServer(cache);
    const response = await fetch(`${origin}/api/tts/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Cached', voiceId: 'Ashley' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-pageecho-tts-cache')).toBe('HIT');
    await expect(response.json()).resolves.toEqual({
      audioContent: 'encoded-audio',
      timestampInfo: { wordAlignment: { words: ['Cached'] } },
      cacheKey: 'cache-key',
      cacheStatus: 'hit',
    });
    expect(cache.synthesize).toHaveBeenCalledWith({
      text: 'Cached',
      voiceId: 'Ashley',
    });
  });

  it('returns structured errors for invalid JSON', async () => {
    const origin = await startTestServer({ isConfigured: false });
    const response = await fetch(`${origin}/api/tts/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'INVALID_JSON',
      message: 'Request body must be valid JSON.',
    });
  });
});
