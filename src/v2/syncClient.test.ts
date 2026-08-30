import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSyncedDocument,
  downloadDocumentBlob,
  setSyncAuthUid,
  uploadDocumentBlob,
} from './syncClient';

function configureFirebaseWithoutAuth(): void {
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'folioduet-test');
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'folioduet-test.firebaseapp.com');
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:1:web:test');
  setSyncAuthUid(null);
}

describe('Firebase-mode local document fallback', () => {
  afterEach(() => {
    setSyncAuthUid(null);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps document blobs local while Firebase auth is unavailable', async () => {
    configureFirebaseWithoutAuth();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const source = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    await uploadDocumentBlob('doc-1', 'source', source);
    await expect(downloadDocumentBlob('doc-1', 'source', 'test.pdf')).resolves.toBeNull();
    await deleteSyncedDocument('doc-1');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
