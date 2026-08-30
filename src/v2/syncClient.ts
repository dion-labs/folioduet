import type { LibraryDocument, ReaderPreferences } from './types';
import { isFirebaseConfigured } from './firebase/app';
import {
  clearFirebaseProcessedPages,
  deleteFirebaseDocument,
  fetchFirebaseBootstrap,
  fetchProcessedPages,
  putFirebaseActiveDocumentId,
  putFirebaseDocumentProgress,
  putFirebaseLibrary,
  putFirebasePreferences,
  putFirebaseSecrets,
  readFirebaseSecrets,
  uploadProcessedPages,
} from './firebase/sync';

export interface SyncSecretsStatus {
  inworldConfigured: boolean;
  fishAudioConfigured: boolean;
}

export type SyncedPreferences = Omit<ReaderPreferences, 'inworldApiKey' | 'fishAudioApiKey'> & {
  updatedAt?: number;
};

export interface SyncBootstrap {
  preferences: SyncedPreferences;
  library: LibraryDocument[];
  activeDocumentId: string | null;
  secrets: SyncSecretsStatus;
}

let authUid: string | null = null;

/** Called when Firebase Auth state changes. Null clears Firebase sync mode. */
export function setSyncAuthUid(uid: string | null): void {
  authUid = uid;
}

export function usesFirebaseSync(): boolean {
  return isFirebaseConfigured() && typeof authUid === 'string' && authUid.length > 0;
}

function requireUid(): string {
  if (!authUid) throw new Error('Sign in required for cloud sync.');
  return authUid;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      typeof body?.message === 'string' ? body.message : `Sync request failed (${response.status}).`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function fetchBootstrap(): Promise<SyncBootstrap> {
  if (usesFirebaseSync()) {
    return fetchFirebaseBootstrap(requireUid());
  }
  return readJson(await fetch('/api/sync/bootstrap'));
}

export async function putPreferences(
  preferences: SyncedPreferences,
): Promise<SyncedPreferences> {
  if (usesFirebaseSync()) {
    return putFirebasePreferences(requireUid(), preferences);
  }
  return readJson(
    await fetch('/api/sync/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    }),
  );
}

export async function putLibrary(
  documents: LibraryDocument[],
  activeDocumentId: string | null,
): Promise<{ documents: LibraryDocument[]; activeDocumentId: string | null }> {
  if (usesFirebaseSync()) {
    return putFirebaseLibrary(requireUid(), documents, activeDocumentId);
  }
  return readJson(
    await fetch('/api/sync/library', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents, activeDocumentId }),
    }),
  );
}

/** Persist only which book is open — cheap enough to run immediately on select. */
export async function putActiveDocumentId(activeDocumentId: string | null): Promise<void> {
  if (usesFirebaseSync()) {
    await putFirebaseActiveDocumentId(requireUid(), activeDocumentId);
    return;
  }
  // Legacy Node sync stores active id with the library payload; no separate route.
}

/** Persist page/stream progress immediately (don't wait on debounced library sync). */
export async function putDocumentProgress(
  documentId: string,
  progress: {
    currentPageIndex: number;
    activeBlockIndex: number;
    activeWordIndex: number;
    activeStreamIndex?: number;
  },
): Promise<void> {
  if (usesFirebaseSync()) {
    await putFirebaseDocumentProgress(requireUid(), documentId, progress);
  }
}

export async function putSecrets(input: {
  inworldApiKey?: string;
  fishAudioApiKey?: string;
  clearInworld?: boolean;
  clearFishAudio?: boolean;
}): Promise<SyncSecretsStatus> {
  if (usesFirebaseSync()) {
    return putFirebaseSecrets(requireUid(), input);
  }
  return readJson(
    await fetch('/api/sync/secrets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function readSecrets(): Promise<{
  inworldApiKey: string;
  fishAudioApiKey: string;
}> {
  if (usesFirebaseSync()) {
    return readFirebaseSecrets(requireUid());
  }
  return readJson(await fetch('/api/sync/secrets'));
}

/**
 * Originals stay device-local in Firebase ship mode (no Storage).
 * Node sync still mirrors blobs for the transitional single-user server.
 */
export async function uploadDocumentBlob(
  documentId: string,
  kind: 'source' | 'paired-pdf',
  file: File,
): Promise<void> {
  // Firebase deployments intentionally keep originals device-local, including
  // while anonymous auth is still connecting or unavailable.
  if (isFirebaseConfigured()) return;
  const params = new URLSearchParams({ fileName: file.name });
  const response = await fetch(
    `/api/sync/documents/${encodeURIComponent(documentId)}/${kind}?${params}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    },
  );
  await readJson(response);
}

export async function downloadDocumentBlob(
  documentId: string,
  kind: 'source' | 'paired-pdf',
  fileName: string,
): Promise<File | null> {
  if (isFirebaseConfigured()) return null;
  const response = await fetch(
    `/api/sync/documents/${encodeURIComponent(documentId)}/${kind}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    await readJson(response);
    return null;
  }
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
  return new File([buffer], fileName, { type: contentType });
}

export async function deleteSyncedDocument(documentId: string): Promise<void> {
  if (usesFirebaseSync()) {
    await deleteFirebaseDocument(requireUid(), documentId);
    return;
  }
  // No remote row exists when Firebase auth never became available.
  if (isFirebaseConfigured()) return;
  await readJson(
    await fetch(`/api/sync/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    }),
  );
}

/** Upload processed markdown pages for cross-device read (Firebase only). */
export async function syncProcessedPages(
  documentId: string,
  pages: Array<{ pageIndex: number; markdown: string }>,
): Promise<void> {
  if (!usesFirebaseSync()) return;
  await uploadProcessedPages(requireUid(), documentId, pages);
}

export async function loadProcessedPages(
  documentId: string,
): Promise<Array<{ pageIndex: number; markdown: string }> | null> {
  if (!usesFirebaseSync()) return null;
  return fetchProcessedPages(requireUid(), documentId);
}

/** Remove generated text while preserving the library row and original file. */
export async function clearProcessedPages(documentId: string): Promise<void> {
  if (!usesFirebaseSync()) return;
  await clearFirebaseProcessedPages(requireUid(), documentId);
}

export function toSyncedPreferences(preferences: ReaderPreferences): SyncedPreferences {
  const {
    inworldApiKey: _inworldApiKey,
    fishAudioApiKey: _fishAudioApiKey,
    ...rest
  } = preferences;
  return {
    ...rest,
    updatedAt: Date.now(),
  };
}
