import { pdfStore } from '../utils/PDFStore';
import type { LibraryDocument, ReaderPreferences, TtsBufferAhead } from './types';

const LIBRARY_KEY = 'bimodal-library';
const ACTIVE_DOCUMENT_KEY = 'bimodal-active-doc';
const PREFERENCES_KEY = 'pageecho-v2-preferences';
const FISH_DEFAULT_MIGRATION_KEY = 'pageecho-fish-default-v1';

const defaultPreferences: ReaderPreferences = {
  appearance: 'dark',
  fontScale: 1,
  playbackRate: 1,
  volume: 1,
  ttsBufferAhead: 3,
  pdfExtractor: 'pageecho',
  inworldEnabled: false,
  inworldVoiceId: 'Ashley',
  inworldApiKey: '',
  fishAudioEnabled: true,
  fishAudioVoiceId: '933563129e564b19a115bedd57b7406a',
  fishAudioApiKey: '',
};

/** One-time: old default left both neural engines off → system TTS. Flip to Fish. */
function migrateFishDefaultOn(preferences: ReaderPreferences): ReaderPreferences {
  try {
    if (localStorage.getItem(FISH_DEFAULT_MIGRATION_KEY) === '1') return preferences;
    localStorage.setItem(FISH_DEFAULT_MIGRATION_KEY, '1');
    if (!preferences.fishAudioEnabled && !preferences.inworldEnabled) {
      return { ...preferences, fishAudioEnabled: true };
    }
  } catch {
    // ignore quota / private mode
  }
  return preferences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, asNumber(value, fallback)));
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeTtsBufferAhead(value: unknown): TtsBufferAhead {
  return value === 1 || value === 5 ? value : 3;
}

export function normalizeDocument(value: unknown): LibraryDocument | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null;
  }

  const isZip = value.kind === 'markdown-zip' || value.isZip === true || value.name.toLowerCase().endsWith('.zip');
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
    activeStreamIndex: typeof value.activeStreamIndex === 'number' && Number.isFinite(value.activeStreamIndex)
      ? Math.max(0, Math.floor(value.activeStreamIndex))
      : undefined,
    updatedAt,
    addedAt: asNumber(value.addedAt, updatedAt),
    pairedPdfName: typeof value.pairedPdfName === 'string' ? value.pairedPdfName : undefined,
    pairedPdfPages: typeof value.pairedPdfPages === 'number' ? value.pairedPdfPages : undefined,
    isSample: value.isSample === true,
    url: typeof value.url === 'string' ? value.url : undefined,
    catalogSampleId: typeof value.catalogSampleId === 'string' ? value.catalogSampleId : undefined,
    hasProcessedContent: value.hasProcessedContent === true,
    processedFormat: value.processedFormat === 'markdown-pages' ? 'markdown-pages' : null,
  };
}

export function loadLibrary(): LibraryDocument[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeDocument)
      .filter((document): document is LibraryDocument => document !== null);
  } catch {
    return [];
  }
}

/** A failed local save must not tear down the in-memory reading session. */
export function saveLibrary(documents: LibraryDocument[]): boolean {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(documents));
    return true;
  } catch {
    return false;
  }
}

/** Captured once at first read so auth boot races can't erase the restore hint. */
let bootActiveDocumentId: string | null | undefined;

export function loadActiveDocumentId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_DOCUMENT_KEY);
  } catch {
    return null;
  }
}

/** Snapshot of last-open id from before this page's auth/hydrate ran. */
export function peekBootActiveDocumentId(): string | null {
  if (bootActiveDocumentId === undefined) {
    try {
      bootActiveDocumentId = localStorage.getItem(ACTIVE_DOCUMENT_KEY);
    } catch {
      bootActiveDocumentId = null;
    }
  }
  return bootActiveDocumentId;
}

export function saveActiveDocumentId(documentId: string | null): boolean {
  try {
    if (documentId) {
      localStorage.setItem(ACTIVE_DOCUMENT_KEY, documentId);
    } else {
      localStorage.removeItem(ACTIVE_DOCUMENT_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick which book to reopen after bootstrap.
 * Candidates are tried in order (cloud → local → …); first id present in the
 * library wins. Falls back to the first library entry when none match.
 */
export function resolveActiveDocumentId(
  library: Array<{ id: string }>,
  candidates: Array<string | null | undefined>,
): string | null {
  for (const candidate of candidates) {
    const id = typeof candidate === 'string' ? candidate.trim() : '';
    if (id && library.some((document) => document.id === id)) return id;
  }
  return library[0]?.id ?? null;
}

export function loadPreferences(): ReaderPreferences {
  try {
    const saved = localStorage.getItem(PREFERENCES_KEY);
    if (!saved) {
      const legacyVolume = localStorage.getItem('bimodal-tts-volume');
      return migrateFishDefaultOn({
        ...defaultPreferences,
        appearance: localStorage.getItem('bimodal-dark-mode') === 'false' ? 'light' : 'dark',
        volume: boundedNumber(
          legacyVolume?.trim() ? Number(legacyVolume) : undefined,
          1, 0, 1,
        ),
        inworldEnabled: localStorage.getItem('bimodal-inworld-enabled') === 'true',
        inworldVoiceId: localStorage.getItem('bimodal-inworld-voiceid') || 'Ashley',
        fishAudioEnabled: localStorage.getItem('bimodal-fishaudio-enabled') !== 'false',
        fishAudioVoiceId: localStorage.getItem('bimodal-fishaudio-voiceid') || defaultPreferences.fishAudioVoiceId,
      });
    }

    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) return defaultPreferences;

    return migrateFishDefaultOn({
      ...defaultPreferences,
      appearance: parsed.appearance === 'light' ? 'light' : 'dark',
      fontScale: boundedNumber(parsed.fontScale, 1, 0.78, 1.45),
      playbackRate: asNumber(parsed.playbackRate, 1),
      volume: boundedNumber(parsed.volume, 1, 0, 1),
      ttsBufferAhead: normalizeTtsBufferAhead(parsed.ttsBufferAhead),
      pdfExtractor: parsed.pdfExtractor === 'anydoc' ? 'anydoc' : 'pageecho',
      inworldEnabled: parsed.inworldEnabled === true,
      inworldVoiceId: typeof parsed.inworldVoiceId === 'string' ? parsed.inworldVoiceId : defaultPreferences.inworldVoiceId,
      inworldApiKey: '',
      fishAudioEnabled: typeof parsed.fishAudioEnabled === 'boolean'
        ? parsed.fishAudioEnabled
        : defaultPreferences.fishAudioEnabled,
      fishAudioVoiceId:
        typeof parsed.fishAudioVoiceId === 'string'
          ? parsed.fishAudioVoiceId
          : defaultPreferences.fishAudioVoiceId,
      fishAudioApiKey: '',
    });
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(preferences: ReaderPreferences): boolean {
  const { inworldApiKey: _i, fishAudioApiKey: _f, ...safe } = preferences;
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...safe, inworldApiKey: '', fishAudioApiKey: '' }));
    return true;
  } catch {
    return false;
  }
}

export async function saveSourceFile(documentId: string, file: File): Promise<void> {
  await pdfStore.saveFile(documentId, file);
}

export async function loadSourceFile(document: LibraryDocument): Promise<File | string | null> {
  if (document.isSample && document.url) return document.url;
  return pdfStore.getFile(document.id);
}

export async function savePairedPdf(documentId: string, file: File): Promise<void> {
  await pdfStore.saveFile(`${documentId}-paired-pdf`, file);
}

export async function loadPairedPdf(documentId: string): Promise<File | null> {
  return pdfStore.getFile(`${documentId}-paired-pdf`);
}

export async function deleteDocumentFiles(documentId: string): Promise<void> {
  await Promise.allSettled([
    pdfStore.deleteFile(documentId),
    pdfStore.deleteFile(`${documentId}-paired-pdf`),
  ]);
}

export function createDocumentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `document-${crypto.randomUUID()}`;
  }
  return `document-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export { defaultPreferences };
