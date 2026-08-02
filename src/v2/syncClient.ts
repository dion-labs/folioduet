import type { LibraryDocument, ReaderPreferences } from './types';

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
  return readJson(await fetch('/api/sync/bootstrap'));
}

export async function putPreferences(
  preferences: SyncedPreferences,
): Promise<SyncedPreferences> {
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
  return readJson(
    await fetch('/api/sync/library', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents, activeDocumentId }),
    }),
  );
}

export async function putSecrets(input: {
  inworldApiKey?: string;
  fishAudioApiKey?: string;
  clearInworld?: boolean;
  clearFishAudio?: boolean;
}): Promise<SyncSecretsStatus> {
  return readJson(
    await fetch('/api/sync/secrets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function uploadDocumentBlob(
  documentId: string,
  kind: 'source' | 'paired-pdf',
  file: File,
): Promise<void> {
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
  await readJson(
    await fetch(`/api/sync/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    }),
  );
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
