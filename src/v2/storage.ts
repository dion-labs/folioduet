import { pdfStore } from '../utils/PDFStore';
import type { LibraryDocument, ReaderPreferences } from './types';

const LIBRARY_KEY = 'bimodal-library';
const ACTIVE_DOCUMENT_KEY = 'bimodal-active-doc';
const PREFERENCES_KEY = 'pageecho-v2-preferences';

const defaultPreferences: ReaderPreferences = {
  appearance: 'dark',
  fontScale: 1,
  playbackRate: 1,
  volume: 1,
  inworldEnabled: false,
  inworldVoiceId: 'Ashley',
  relayUrl: 'wss://relay.damus.io',
  syncEnabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeDocument(value: unknown): LibraryDocument | null {
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
    updatedAt,
    addedAt: asNumber(value.addedAt, updatedAt),
    pairedPdfName: typeof value.pairedPdfName === 'string' ? value.pairedPdfName : undefined,
    pairedPdfPages: typeof value.pairedPdfPages === 'number' ? value.pairedPdfPages : undefined,
    isSample: value.isSample === true,
    url: typeof value.url === 'string' ? value.url : undefined,
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

export function saveLibrary(documents: LibraryDocument[]): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(documents));
}

export function loadActiveDocumentId(): string | null {
  return localStorage.getItem(ACTIVE_DOCUMENT_KEY);
}

export function saveActiveDocumentId(documentId: string | null): void {
  if (documentId) {
    localStorage.setItem(ACTIVE_DOCUMENT_KEY, documentId);
  } else {
    localStorage.removeItem(ACTIVE_DOCUMENT_KEY);
  }
}

export function loadPreferences(): ReaderPreferences {
  try {
    const saved = localStorage.getItem(PREFERENCES_KEY);
    if (!saved) {
      return {
        ...defaultPreferences,
        appearance: localStorage.getItem('bimodal-dark-mode') === 'false' ? 'light' : 'dark',
        volume: Number(localStorage.getItem('bimodal-tts-volume')) || 1,
        inworldEnabled: localStorage.getItem('bimodal-inworld-enabled') === 'true',
        inworldVoiceId: localStorage.getItem('bimodal-inworld-voiceid') || 'Ashley',
        relayUrl: localStorage.getItem('bimodal-relay-url') || defaultPreferences.relayUrl,
      };
    }

    const parsed: unknown = JSON.parse(saved);
    if (!isRecord(parsed)) return defaultPreferences;

    const { inworldApiKey: _legacyBrowserCredential, ...safeParsed } = parsed;
    return {
      ...defaultPreferences,
      ...safeParsed,
      fontScale: asNumber(safeParsed.fontScale, 1),
      playbackRate: asNumber(safeParsed.playbackRate, 1),
      volume: asNumber(safeParsed.volume, 1),
    } as ReaderPreferences;
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(preferences: ReaderPreferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
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
