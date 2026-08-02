/**
 * Cloudflare Pages Function — thin TTS proxy for the static SPA.
 * Local `npm run dev` still uses the Node server via Vite's /api proxy.
 *
 * Env (Pages → Settings → Environment variables):
 *   VITE_FISH_AUDIO_SPONSOR_KEY or FISH_AUDIO_API_KEY
 */

interface Env {
  VITE_FISH_AUDIO_SPONSOR_KEY?: string;
  FISH_AUDIO_API_KEY?: string;
}

type FishRequest = {
  provider?: string;
  text?: string;
  voiceId?: string;
  modelId?: string;
  fishAudioApiKey?: string;
  apiKey?: string;
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function synthesizeFish(input: {
  text: string;
  voiceId: string;
  modelId: string;
  apiKey: string;
}): Promise<{ audioContent: string; timestampInfo: unknown }> {
  const response = await fetch('https://api.fish.audio/v1/tts/stream/with-timestamp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      model: input.modelId,
    },
    body: JSON.stringify({
      text: input.text,
      reference_id: input.voiceId || undefined,
      format: 'mp3',
      latency: 'balanced',
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { message?: string };
    const message = errorData.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(`Fish Audio API returned error: ${message}`), {
      status: response.status >= 400 && response.status < 500 ? 400 : 502,
    });
  }

  if (!response.body) {
    throw Object.assign(new Error('Fish Audio returned an empty body.'), { status: 502 });
  }

  const audioChunks: Uint8Array[] = [];
  const alignmentByChunk = new Map<
    number,
    { content: string; offset: number; alignment: { segments?: Array<{ text: string; start: number; end: number }> } }
  >();
  const decoder = new TextDecoder();
  let buffer = '';
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const eventText of events) {
      const dataLine = eventText
        .split('\n')
        .find((line) => line.startsWith('data: '));
      if (!dataLine) continue;

      try {
        const event = JSON.parse(dataLine.slice(6)) as {
          audio_base64?: string;
          alignment?: { segments?: Array<{ text: string; start: number; end: number }> } | null;
          chunk_seq?: number;
          content?: string;
          chunk_audio_offset_sec?: number;
        };
        if (event.audio_base64) {
          const binary = atob(event.audio_base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          audioChunks.push(bytes);
        }
        if (event.alignment != null && typeof event.chunk_seq === 'number') {
          alignmentByChunk.set(event.chunk_seq, {
            content: event.content ?? '',
            offset: event.chunk_audio_offset_sec ?? 0,
            alignment: event.alignment,
          });
        }
      } catch {
        // skip malformed SSE chunks
      }
    }
  }

  const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const audio = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of audioChunks) {
    audio.set(chunk, offset);
    offset += chunk.length;
  }

  if (audio.length === 0) {
    throw Object.assign(new Error('Fish Audio returned empty audio.'), { status: 502 });
  }

  const timeline: Array<{ text: string; start: number; end: number }> = [];
  for (const [, item] of [...alignmentByChunk.entries()].sort(([a], [b]) => a - b)) {
    if (item.alignment && Array.isArray(item.alignment.segments)) {
      for (const segment of item.alignment.segments) {
        timeline.push({
          text: segment.text,
          start: segment.start + item.offset,
          end: segment.end + item.offset,
        });
      }
    }
  }

  return {
    audioContent: bytesToBase64(audio),
    timestampInfo: {
      wordAlignment: {
        words: timeline.map((t) => t.text),
        wordStartTimeSeconds: timeline.map((t) => t.start),
        wordEndTimeSeconds: timeline.map((t) => t.end),
      },
    },
  };
}

async function synthesizeInworld(input: {
  text: string;
  voiceId: string;
  modelId: string;
  apiKey: string;
}): Promise<{ audioContent: string; timestampInfo: unknown }> {
  const authHeader = input.apiKey.startsWith('Basic ')
    ? input.apiKey
    : `Basic ${input.apiKey}`;
  const response = await fetch('https://api.inworld.ai/tts/v1/voice', {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: input.text,
      voiceId: input.voiceId,
      modelId: input.modelId,
      timestampType: 'WORD',
      audioConfig: {
        audioEncoding: 'MP3',
        sampleRateHertz: 22050,
      },
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { message?: string };
    const message = errorData.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(`Inworld API returned error: ${message}`), {
      status: response.status >= 400 && response.status < 500 ? 400 : 502,
    });
  }

  const data = (await response.json()) as {
    audioContent?: string;
    timestampInfo?: unknown;
  };
  if (!data.audioContent) {
    throw Object.assign(new Error('No audioContent returned from Inworld API'), { status: 502 });
  }
  return {
    audioContent: data.audioContent,
    timestampInfo: data.timestampInfo,
  };
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  let input: FishRequest;
  try {
    input = (await context.request.json()) as FishRequest;
  } catch {
    return json(400, { message: 'Invalid JSON body.' });
  }

  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) {
    return json(400, { message: 'Missing text.' });
  }

  const provider = input.provider === 'fish-audio' ? 'fish-audio' : 'inworld';

  try {
    if (provider === 'fish-audio') {
      const sponsor =
        (context.env.VITE_FISH_AUDIO_SPONSOR_KEY || context.env.FISH_AUDIO_API_KEY || '').trim();
      const apiKey = (typeof input.fishAudioApiKey === 'string' && input.fishAudioApiKey.trim())
        || sponsor;
      if (!apiKey) {
        return json(503, {
          message: 'Fish Audio is not configured. Set VITE_FISH_AUDIO_SPONSOR_KEY on Pages, or save a BYOK key.',
          code: 'FISH_AUDIO_NOT_CONFIGURED',
        });
      }

      const result = await synthesizeFish({
        text,
        voiceId: typeof input.voiceId === 'string' && input.voiceId.trim()
          ? input.voiceId.trim()
          : '933563129e564b19a115bedd57b7406a',
        modelId: typeof input.modelId === 'string' && input.modelId.trim()
          ? input.modelId.trim()
          : 's2.1-pro-free',
        apiKey,
      });

      return json(200, {
        audioContent: result.audioContent,
        timestampInfo: result.timestampInfo,
        cacheStatus: 'miss',
      }, { 'X-PageEcho-TTS-Cache': 'MISS' });
    }

    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    if (!apiKey) {
      return json(503, {
        message: 'Inworld requires your own API key (BYOK).',
        code: 'INWORLD_NOT_CONFIGURED',
      });
    }

    const result = await synthesizeInworld({
      text,
      voiceId: typeof input.voiceId === 'string' && input.voiceId.trim()
        ? input.voiceId.trim()
        : 'Ashley',
      modelId: typeof input.modelId === 'string' && input.modelId.trim()
        ? input.modelId.trim()
        : 'inworld-tts-2',
      apiKey,
    });

    return json(200, {
      audioContent: result.audioContent,
      timestampInfo: result.timestampInfo,
      cacheStatus: 'miss',
    }, { 'X-PageEcho-TTS-Cache': 'MISS' });
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? Number((error as { status?: number }).status) || 502
        : 502;
    const message = error instanceof Error ? error.message : 'TTS synthesis failed.';
    return json(status, { message });
  }
}
