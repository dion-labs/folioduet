import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_MODEL_ID = 'inworld-tts-2';
const DEFAULT_TIMESTAMP_TYPE = 'WORD';
const DEFAULT_AUDIO_CONFIG = Object.freeze({
  audioEncoding: 'MP3',
  sampleRateHertz: 22050,
});

export class TtsCacheError extends Error {
  constructor(message, statusCode = 500, code = 'TTS_CACHE_ERROR') {
    super(message);
    this.name = 'TtsCacheError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safePathSegment(value) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || 'default';
}

function normalizeRequest(input) {
  if (!input || typeof input !== 'object') {
    throw new TtsCacheError('A JSON TTS request is required.', 400, 'INVALID_REQUEST');
  }

  const provider = typeof input.provider === 'string' ? input.provider.trim() : 'inworld';
  const text = typeof input.text === 'string' ? input.text : '';
  const voiceId = typeof input.voiceId === 'string' ? input.voiceId.trim() : '';

  if (!text.trim()) {
    throw new TtsCacheError('TTS text cannot be empty.', 400, 'EMPTY_TEXT');
  }
  if (text.length > 2000) {
    throw new TtsCacheError(
      'TTS text cannot exceed 2,000 characters.',
      400,
      'TEXT_TOO_LONG',
    );
  }

  if (provider === 'fish-audio') {
    const modelId = typeof input.modelId === 'string' && input.modelId.trim()
      ? input.modelId.trim()
      : 's2.1-pro-free';
    const fishAudioApiKey = typeof input.fishAudioApiKey === 'string' ? input.fishAudioApiKey.trim() : '';
    return { provider, text, voiceId, modelId, fishAudioApiKey };
  }

  const modelId = typeof input.modelId === 'string' && input.modelId.trim()
    ? input.modelId.trim()
    : DEFAULT_MODEL_ID;
  const timestampType = typeof input.timestampType === 'string' && input.timestampType.trim()
    ? input.timestampType.trim()
    : DEFAULT_TIMESTAMP_TYPE;
  const audioConfig = {
    audioEncoding:
      typeof input.audioConfig?.audioEncoding === 'string'
        ? input.audioConfig.audioEncoding
        : DEFAULT_AUDIO_CONFIG.audioEncoding,
    sampleRateHertz:
      Number.isInteger(input.audioConfig?.sampleRateHertz)
        ? input.audioConfig.sampleRateHertz
        : DEFAULT_AUDIO_CONFIG.sampleRateHertz,
  };

  if (!voiceId || voiceId.length > 128) {
    throw new TtsCacheError('A valid voiceId is required.', 400, 'INVALID_VOICE');
  }
  if (modelId.length > 128 || timestampType.length > 32) {
    throw new TtsCacheError('Invalid model or timestamp mode.', 400, 'INVALID_MODEL');
  }
  if (
    audioConfig.audioEncoding !== 'MP3' ||
    audioConfig.sampleRateHertz < 8000 ||
    audioConfig.sampleRateHertz > 48000
  ) {
    throw new TtsCacheError('Unsupported audio configuration.', 400, 'INVALID_AUDIO_CONFIG');
  }

  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  return { provider, text, voiceId, modelId, timestampType, audioConfig, apiKey };
}

export function createTtsCacheKey(input) {
  const request = normalizeRequest(input);
  if (request.provider === 'fish-audio') {
    return sha256(JSON.stringify({
      provider: 'fish-audio',
      modelId: request.modelId,
      voiceId: request.voiceId,
      text: request.text,
    }));
  }
  return sha256(JSON.stringify({
    provider: 'inworld',
    modelId: request.modelId,
    voiceId: request.voiceId,
    text: request.text,
    timestampType: request.timestampType,
    audioConfig: request.audioConfig,
  }));
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function writeAtomic(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { flag: 'wx' });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export class TtsCache {
  constructor({
    dataDir,
    apiKey = process.env.INWORLD_API_KEY || '',
    fishAudioApiKey = process.env.FISH_AUDIO_API_KEY || '',
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
  }) {
    if (!dataDir) throw new Error('TtsCache requires a dataDir.');
    if (typeof fetchImpl !== 'function') throw new Error('TtsCache requires fetch support.');

    this.dataDir = path.resolve(dataDir);
    this.apiKey = apiKey;
    this.fishAudioApiKey = fishAudioApiKey;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.inFlight = new Map();

    const databaseDir = path.join(this.dataDir, 'database');
    const databasePath = path.join(databaseDir, 'pageecho.sqlite');
    this.ready = mkdir(databaseDir, { recursive: true }).then(() => {
      this.database = new DatabaseSync(databasePath);
      this.database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS tts_chunks (
          cache_key TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          model_id TEXT NOT NULL,
          voice_id TEXT NOT NULL,
          text_sha256 TEXT NOT NULL,
          text_length INTEGER NOT NULL,
          audio_encoding TEXT NOT NULL,
          sample_rate_hz INTEGER NOT NULL,
          audio_path TEXT NOT NULL,
          timestamps_path TEXT NOT NULL,
          audio_bytes INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL,
          hit_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_tts_chunks_last_accessed
          ON tts_chunks(last_accessed_at);
        CREATE INDEX IF NOT EXISTS idx_tts_chunks_voice_model
          ON tts_chunks(voice_id, model_id);
      `);
      this.findStatement = this.database.prepare(
        'SELECT * FROM tts_chunks WHERE cache_key = ?',
      );
      this.touchStatement = this.database.prepare(`
        UPDATE tts_chunks
        SET last_accessed_at = ?, hit_count = hit_count + 1
        WHERE cache_key = ?
      `);
      this.deleteStatement = this.database.prepare(
        'DELETE FROM tts_chunks WHERE cache_key = ?',
      );
      this.insertStatement = this.database.prepare(`
        INSERT OR REPLACE INTO tts_chunks (
          cache_key, provider, model_id, voice_id, text_sha256, text_length,
          audio_encoding, sample_rate_hz, audio_path, timestamps_path,
          audio_bytes, created_at, last_accessed_at, hit_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `);
    });
  }

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  get isFishAudioConfigured() {
    return Boolean(this.fishAudioApiKey);
  }

  setCredentials({ inworldApiKey, fishAudioApiKey } = {}) {
    if (typeof inworldApiKey === 'string') {
      this.apiKey = inworldApiKey.trim();
    }
    if (typeof fishAudioApiKey === 'string') {
      this.fishAudioApiKey = fishAudioApiKey.trim();
    }
  }

  resolveStoredPath(relativePath) {
    const absolutePath = path.resolve(this.dataDir, relativePath);
    const expectedPrefix = `${this.dataDir}${path.sep}`;
    if (!absolutePath.startsWith(expectedPrefix)) {
      throw new TtsCacheError('Unsafe cache path in database.', 500, 'UNSAFE_CACHE_PATH');
    }
    return absolutePath;
  }

  async readEntry(cacheKey) {
    await this.ready;
    const row = this.findStatement.get(cacheKey);
    if (!row) return null;

    const audioPath = this.resolveStoredPath(row.audio_path);
    const timestampsPath = this.resolveStoredPath(row.timestamps_path);
    if (!(await pathExists(audioPath)) || !(await pathExists(timestampsPath))) {
      this.deleteStatement.run(cacheKey);
      return null;
    }

    try {
      const [audio, timestampJson] = await Promise.all([
        readFile(audioPath),
        readFile(timestampsPath, 'utf8'),
      ]);
      const timestampInfo = JSON.parse(timestampJson);
      this.touchStatement.run(this.now(), cacheKey);
      return {
        cacheKey,
        cacheStatus: 'hit',
        audioContent: audio.toString('base64'),
        timestampInfo,
      };
    } catch (error) {
      this.deleteStatement.run(cacheKey);
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async synthesize(input) {
    const request = normalizeRequest(input);
    const cacheKey = createTtsCacheKey(request);
    const cached = await this.readEntry(cacheKey);
    if (cached) return cached;

    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;

    const generation = this.generateAndStore(cacheKey, request);
    this.inFlight.set(cacheKey, generation);
    try {
      return await generation;
    } finally {
      if (this.inFlight.get(cacheKey) === generation) {
        this.inFlight.delete(cacheKey);
      }
    }
  }

  async generateAndStore(cacheKey, request) {
    if (request.provider === 'fish-audio') {
      return this.generateAndStoreFishAudio(cacheKey, request);
    }
    return this.generateAndStoreInworld(cacheKey, request);
  }

  async generateAndStoreFishAudio(cacheKey, request) {
    const apiKey = request.fishAudioApiKey || this.fishAudioApiKey;
    if (!apiKey) {
      throw new TtsCacheError(
        'The server has no FISH_AUDIO_API_KEY configured.',
        503,
        'FISH_AUDIO_NOT_CONFIGURED',
      );
    }

    const response = await this.fetchImpl('https://api.fish.audio/v1/tts/stream/with-timestamp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        model: request.modelId,
      },
      body: JSON.stringify({
        text: request.text,
        reference_id: request.voiceId || undefined,
        format: 'mp3',
        latency: 'balanced',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.message || `HTTP ${response.status}`;
      throw new TtsCacheError(
        `Fish Audio API returned error: ${message}`,
        response.status >= 400 && response.status < 500 ? 400 : 502,
        'FISH_AUDIO_ERROR',
      );
    }

    const audioChunks = [];
    const alignmentByChunk = new Map();
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const eventText of events) {
        const dataLine = eventText
          .split('\n')
          .find((line) => line.startsWith('data: '));

        if (!dataLine) continue;

        try {
          const event = JSON.parse(dataLine.slice(6));
          if (event.audio_base64) {
            audioChunks.push(Buffer.from(event.audio_base64, 'base64'));
          }

          if (event.alignment !== null && event.alignment !== undefined) {
            alignmentByChunk.set(event.chunk_seq, {
              content: event.content,
              offset: event.chunk_audio_offset_sec ?? 0,
              alignment: event.alignment,
            });
          }
        } catch (e) {
          console.error('[FolioDuet] Error parsing Fish Audio SSE event:', e);
        }
      }
    }

    const audio = Buffer.concat(audioChunks);
    if (audio.length === 0) {
      throw new TtsCacheError(
        'Fish Audio returned empty audio.',
        502,
        'INVALID_FISH_AUDIO_RESPONSE',
      );
    }

    const timeline = [];
    for (const [chunkSeq, item] of [...alignmentByChunk.entries()].sort(([a], [b]) => a - b)) {
      if (item.alignment && Array.isArray(item.alignment.segments)) {
        for (const segment of item.alignment.segments) {
          timeline.push({
            text: segment.text,
            start: segment.start + item.offset,
            end: segment.end + item.offset,
            chunk_seq: chunkSeq,
          });
        }
      }
    }

    const timestampInfo = {
      wordAlignment: {
        words: timeline.map((t) => t.text),
        wordStartTimeSeconds: timeline.map((t) => t.start),
        wordEndTimeSeconds: timeline.map((t) => t.end),
      },
    };

    const voiceDirectory = safePathSegment(request.voiceId || 'default');
    const relativeDirectory = path.join('tts', 'fish-audio', voiceDirectory, cacheKey.slice(0, 2));
    const audioRelativePath = path.join(relativeDirectory, `${cacheKey}.mp3`);
    const timestampsRelativePath = path.join(relativeDirectory, `${cacheKey}.timestamps.json`);
    const audioPath = this.resolveStoredPath(audioRelativePath);
    const timestampsPath = this.resolveStoredPath(timestampsRelativePath);

    await Promise.all([
      writeAtomic(audioPath, audio),
      writeAtomic(
        timestampsPath,
        JSON.stringify(timestampInfo, null, 2),
      ),
    ]);

    await this.ready;
    const timestamp = this.now();
    this.insertStatement.run(
      cacheKey,
      'fish-audio',
      request.modelId,
      request.voiceId || 'default',
      sha256(request.text),
      request.text.length,
      'MP3',
      22050,
      audioRelativePath,
      timestampsRelativePath,
      audio.length,
      timestamp,
      timestamp,
    );

    return {
      cacheKey,
      cacheStatus: 'miss',
      audioContent: audio.toString('base64'),
      timestampInfo,
    };
  }

  async generateAndStoreInworld(cacheKey, request) {
    const apiKey = request.apiKey || this.apiKey;
    if (!apiKey) {
      throw new TtsCacheError(
        'The server has no INWORLD_API_KEY configured.',
        503,
        'INWORLD_NOT_CONFIGURED',
      );
    }

    const authHeader = apiKey.startsWith('Basic ')
      ? apiKey
      : `Basic ${apiKey}`;
    const response = await this.fetchImpl('https://api.inworld.ai/tts/v1/voice', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.message || `HTTP ${response.status}`;
      throw new TtsCacheError(
        `Inworld API returned error: ${message}`,
        response.status >= 400 && response.status < 500 ? 400 : 502,
        'INWORLD_ERROR',
      );
    }

    const data = await response.json();
    if (typeof data.audioContent !== 'string' || !data.audioContent) {
      throw new TtsCacheError(
        'Inworld returned no audioContent.',
        502,
        'INVALID_INWORLD_RESPONSE',
      );
    }

    const audio = Buffer.from(data.audioContent, 'base64');
    if (audio.length === 0) {
      throw new TtsCacheError(
        'Inworld returned empty audio.',
        502,
        'INVALID_INWORLD_RESPONSE',
      );
    }

    const voiceDirectory = safePathSegment(request.voiceId);
    const relativeDirectory = path.join('tts', voiceDirectory, cacheKey.slice(0, 2));
    const audioRelativePath = path.join(relativeDirectory, `${cacheKey}.mp3`);
    const timestampsRelativePath = path.join(relativeDirectory, `${cacheKey}.timestamps.json`);
    const audioPath = this.resolveStoredPath(audioRelativePath);
    const timestampsPath = this.resolveStoredPath(timestampsRelativePath);

    await Promise.all([
      writeAtomic(audioPath, audio),
      writeAtomic(
        timestampsPath,
        JSON.stringify(data.timestampInfo ?? {}, null, 2),
      ),
    ]);

    await this.ready;
    const timestamp = this.now();
    this.insertStatement.run(
      cacheKey,
      'inworld',
      request.modelId,
      request.voiceId,
      sha256(request.text),
      request.text.length,
      request.audioConfig.audioEncoding,
      request.audioConfig.sampleRateHertz,
      audioRelativePath,
      timestampsRelativePath,
      audio.length,
      timestamp,
      timestamp,
    );

    return {
      cacheKey,
      cacheStatus: 'miss',
      audioContent: data.audioContent,
      timestampInfo: data.timestampInfo ?? {},
    };
  }

  async getStats() {
    await this.ready;
    const row = this.database.prepare(`
      SELECT
        COUNT(*) AS entries,
        COALESCE(SUM(audio_bytes), 0) AS audio_bytes,
        COALESCE(SUM(hit_count), 0) AS cache_hits,
        COALESCE(MAX(last_accessed_at), 0) AS last_accessed_at
      FROM tts_chunks
    `).get();
    return {
      entries: Number(row.entries),
      audioBytes: Number(row.audio_bytes),
      cacheHits: Number(row.cache_hits),
      lastAccessedAt: Number(row.last_accessed_at) || null,
    };
  }

  async close() {
    await this.ready;
    this.database.close();
  }
}
