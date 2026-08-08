import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PREFERENCES_ROW = 'preferences';
const LIBRARY_ROW = 'library';
const ACTIVE_DOCUMENT_ROW = 'active_document_id';
const SECRET_INWORLD = 'inworld_api_key';
const SECRET_FISH = 'fish_audio_api_key';

const defaultPreferences = Object.freeze({
  appearance: 'dark',
  fontScale: 1,
  playbackRate: 1,
  volume: 1,
  pdfExtractor: 'pageecho',
  inworldEnabled: false,
  inworldVoiceId: 'Ashley',
  fishAudioEnabled: true,
  fishAudioVoiceId: '933563129e564b19a115bedd57b7406a',
  updatedAt: 0,
});

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizePreferences(input) {
  const source = isRecord(input) ? input : {};
  return {
    appearance: source.appearance === 'light' ? 'light' : 'dark',
    fontScale: asNumber(source.fontScale, defaultPreferences.fontScale),
    playbackRate: asNumber(source.playbackRate, defaultPreferences.playbackRate),
    volume: asNumber(source.volume, defaultPreferences.volume),
    pdfExtractor: source.pdfExtractor === 'anydoc' ? 'anydoc' : 'pageecho',
    inworldEnabled: source.inworldEnabled === true,
    inworldVoiceId:
      typeof source.inworldVoiceId === 'string' && source.inworldVoiceId.trim()
        ? source.inworldVoiceId.trim()
        : defaultPreferences.inworldVoiceId,
    fishAudioEnabled: source.fishAudioEnabled !== false,
    fishAudioVoiceId:
      typeof source.fishAudioVoiceId === 'string' && source.fishAudioVoiceId.trim()
        ? source.fishAudioVoiceId.trim()
        : defaultPreferences.fishAudioVoiceId,
    updatedAt: asNumber(source.updatedAt, Date.now()),
  };
}

function sanitizeDocument(value) {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null;
  }
  const isZip =
    value.kind === 'markdown-zip' ||
    value.isZip === true ||
    (typeof value.name === 'string' && value.name.toLowerCase().endsWith('.zip'));
  const updatedAt = asNumber(value.updatedAt, Date.now());
  return {
    id: value.id,
    name: value.name.replace(/\.(pdf|zip)$/i, ''),
    kind: isZip ? 'markdown-zip' : 'pdf',
    sourceName: typeof value.sourceName === 'string' ? value.sourceName : value.name,
    totalPages: Math.max(1, asNumber(value.totalPages, 1)),
    currentPageIndex: Math.max(0, asNumber(value.currentPageIndex, 0)),
    activeBlockIndex: Math.max(0, asNumber(value.activeBlockIndex, 0)),
    activeWordIndex: Math.max(0, asNumber(value.activeWordIndex, 0)),
    updatedAt,
    addedAt: asNumber(value.addedAt, updatedAt),
    pairedPdfName: typeof value.pairedPdfName === 'string' ? value.pairedPdfName : undefined,
    pairedPdfPages: typeof value.pairedPdfPages === 'number' ? value.pairedPdfPages : undefined,
    isSample: value.isSample === true,
    url: typeof value.url === 'string' ? value.url : undefined,
  };
}

function safeDocumentId(documentId) {
  if (typeof documentId !== 'string' || !/^document-[\w.-]+$/.test(documentId)) {
    throw Object.assign(new Error('Invalid document id.'), {
      statusCode: 400,
      code: 'INVALID_DOCUMENT_ID',
    });
  }
  return documentId;
}

export class SyncStore {
  constructor({ dataDir }) {
    if (!dataDir) throw new Error('SyncStore requires a dataDir.');
    this.dataDir = path.resolve(dataDir);
    this.libraryDir = path.join(this.dataDir, 'library');
    const databaseDir = path.join(this.dataDir, 'database');
    const databasePath = path.join(databaseDir, 'pageecho.sqlite');

    this.ready = mkdir(databaseDir, { recursive: true })
      .then(() => mkdir(this.libraryDir, { recursive: true }))
      .then(() => {
        this.database = new DatabaseSync(databasePath);
        this.database.exec(`
          PRAGMA journal_mode = WAL;
          PRAGMA synchronous = NORMAL;
          PRAGMA busy_timeout = 5000;
          CREATE TABLE IF NOT EXISTS sync_kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);
        this.getStatement = this.database.prepare(
          'SELECT value, updated_at AS updatedAt FROM sync_kv WHERE key = ?',
        );
        this.setStatement = this.database.prepare(`
          INSERT INTO sync_kv (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `);
        this.deleteStatement = this.database.prepare('DELETE FROM sync_kv WHERE key = ?');
      });
  }

  async close() {
    await this.ready;
    this.database.close();
  }

  getRaw(key) {
    return this.getStatement.get(key) || null;
  }

  setRaw(key, value, updatedAt = Date.now()) {
    this.setStatement.run(key, value, updatedAt);
  }

  async getPreferences() {
    await this.ready;
    const row = this.getRaw(PREFERENCES_ROW);
    if (!row) return { ...defaultPreferences };
    try {
      return sanitizePreferences(JSON.parse(row.value));
    } catch {
      return { ...defaultPreferences };
    }
  }

  async setPreferences(input) {
    await this.ready;
    const preferences = sanitizePreferences({
      ...input,
      updatedAt: asNumber(input?.updatedAt, Date.now()),
    });
    this.setRaw(PREFERENCES_ROW, JSON.stringify(preferences), preferences.updatedAt);
    return preferences;
  }

  async getLibrary() {
    await this.ready;
    const row = this.getRaw(LIBRARY_ROW);
    if (!row) return [];
    try {
      const parsed = JSON.parse(row.value);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(sanitizeDocument).filter(Boolean);
    } catch {
      return [];
    }
  }

  async setLibrary(documents) {
    await this.ready;
    if (!Array.isArray(documents)) {
      throw Object.assign(new Error('Library must be an array.'), {
        statusCode: 400,
        code: 'INVALID_LIBRARY',
      });
    }
    const sanitized = documents.map(sanitizeDocument).filter(Boolean);
    const updatedAt = Date.now();
    this.setRaw(LIBRARY_ROW, JSON.stringify(sanitized), updatedAt);
    return { documents: sanitized, updatedAt };
  }

  async getActiveDocumentId() {
    await this.ready;
    const row = this.getRaw(ACTIVE_DOCUMENT_ROW);
    if (!row) return null;
    try {
      const value = JSON.parse(row.value);
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }

  async setActiveDocumentId(documentId) {
    await this.ready;
    if (documentId == null || documentId === '') {
      this.deleteStatement.run(ACTIVE_DOCUMENT_ROW);
      return null;
    }
    if (typeof documentId !== 'string') {
      throw Object.assign(new Error('Active document id must be a string.'), {
        statusCode: 400,
        code: 'INVALID_ACTIVE_DOCUMENT',
      });
    }
    this.setRaw(ACTIVE_DOCUMENT_ROW, JSON.stringify(documentId), Date.now());
    return documentId;
  }

  async getSecretsStatus() {
    await this.ready;
    const inworld = this.getRaw(SECRET_INWORLD);
    const fish = this.getRaw(SECRET_FISH);
    return {
      inworldConfigured: Boolean(inworld?.value),
      fishAudioConfigured: Boolean(fish?.value),
    };
  }

  async getSecretValues() {
    await this.ready;
    const inworld = this.getRaw(SECRET_INWORLD);
    const fish = this.getRaw(SECRET_FISH);
    return {
      inworldApiKey: inworld?.value || '',
      fishAudioApiKey: fish?.value || '',
    };
  }

  async setSecrets({ inworldApiKey, fishAudioApiKey, clearInworld = false, clearFishAudio = false } = {}) {
    await this.ready;
    if (clearInworld) {
      this.deleteStatement.run(SECRET_INWORLD);
    } else if (typeof inworldApiKey === 'string' && inworldApiKey.trim()) {
      this.setRaw(SECRET_INWORLD, inworldApiKey.trim(), Date.now());
    }

    if (clearFishAudio) {
      this.deleteStatement.run(SECRET_FISH);
    } else if (typeof fishAudioApiKey === 'string' && fishAudioApiKey.trim()) {
      this.setRaw(SECRET_FISH, fishAudioApiKey.trim(), Date.now());
    }

    return this.getSecretsStatus();
  }

  documentPath(documentId, kind) {
    const id = safeDocumentId(documentId);
    if (kind !== 'source' && kind !== 'paired-pdf') {
      throw Object.assign(new Error('Invalid document blob kind.'), {
        statusCode: 400,
        code: 'INVALID_BLOB_KIND',
      });
    }
    return {
      id,
      dir: path.join(this.libraryDir, id),
      filePath: path.join(this.libraryDir, id, kind),
      metaPath: path.join(this.libraryDir, id, `${kind}.json`),
    };
  }

  async saveDocumentBlob(documentId, kind, buffer, { fileName = 'file', contentType = 'application/octet-stream' } = {}) {
    await this.ready;
    const { dir, filePath, metaPath } = this.documentPath(documentId, kind);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, buffer);
    await writeFile(
      metaPath,
      JSON.stringify({
        fileName,
        contentType,
        byteLength: buffer.byteLength,
        updatedAt: Date.now(),
      }),
    );
    return { documentId, kind, byteLength: buffer.byteLength, fileName, contentType };
  }

  async getDocumentBlob(documentId, kind) {
    await this.ready;
    const { filePath, metaPath } = this.documentPath(documentId, kind);
    try {
      const [buffer, metaRaw] = await Promise.all([
        readFile(filePath),
        readFile(metaPath, 'utf8').catch(() => null),
      ]);
      let meta = { fileName: kind, contentType: 'application/octet-stream' };
      if (metaRaw) {
        try {
          meta = { ...meta, ...JSON.parse(metaRaw) };
        } catch {
          // keep defaults
        }
      }
      return { buffer, ...meta };
    } catch {
      return null;
    }
  }

  async deleteDocument(documentId) {
    await this.ready;
    const { dir, id } = this.documentPath(documentId, 'source');
    await rm(dir, { recursive: true, force: true });
    const library = await this.getLibrary();
    const next = library.filter((document) => document.id !== id);
    await this.setLibrary(next);
    const active = await this.getActiveDocumentId();
    if (active === id) await this.setActiveDocumentId(null);
    return { deleted: id };
  }

  async bootstrap() {
    await this.ready;
    const [preferences, library, activeDocumentId, secrets] = await Promise.all([
      this.getPreferences(),
      this.getLibrary(),
      this.getActiveDocumentId(),
      this.getSecretsStatus(),
    ]);
    return { preferences, library, activeDocumentId, secrets };
  }
}
