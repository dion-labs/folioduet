import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SyncStore } from './sync-store.mjs';

const tempDirs = [];

afterEach(async () => {
  await Promise.allSettled(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createStore() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pageecho-sync-'));
  tempDirs.push(dataDir);
  const store = new SyncStore({ dataDir });
  await store.ready;
  return store;
}

describe('SyncStore', () => {
  it('persists preferences without secrets', async () => {
    const store = await createStore();
    const saved = await store.setPreferences({
      appearance: 'light',
      fontScale: 1.2,
      inworldEnabled: true,
      inworldApiKey: 'should-not-persist',
    });
    expect(saved.appearance).toBe('light');
    expect(saved.fontScale).toBe(1.2);
    expect(saved.inworldEnabled).toBe(true);
    expect(saved).not.toHaveProperty('inworldApiKey');

    const loaded = await store.getPreferences();
    expect(loaded.appearance).toBe('light');
    expect(loaded).not.toHaveProperty('inworldApiKey');
  });

  it('stores secrets write-only and reports configured status', async () => {
    const store = await createStore();
    expect(await store.getSecretsStatus()).toEqual({
      inworldConfigured: false,
      fishAudioConfigured: false,
    });

    await store.setSecrets({ fishAudioApiKey: 'fish-secret' });
    expect(await store.getSecretsStatus()).toEqual({
      inworldConfigured: false,
      fishAudioConfigured: true,
    });
    expect(await store.getSecretValues()).toEqual({
      inworldApiKey: '',
      fishAudioApiKey: 'fish-secret',
    });

    await store.setSecrets({ clearFishAudio: true });
    expect(await store.getSecretsStatus()).toEqual({
      inworldConfigured: false,
      fishAudioConfigured: false,
    });
  });

  it('round-trips library metadata and document blobs', async () => {
    const store = await createStore();
    const document = {
      id: 'document-abc',
      name: 'Demo',
      kind: 'pdf',
      sourceName: 'Demo.pdf',
      totalPages: 3,
      currentPageIndex: 1,
      activeBlockIndex: 0,
      activeWordIndex: 2,
      updatedAt: 100,
      addedAt: 90,
    };
    await store.setLibrary([document]);
    await store.setActiveDocumentId(document.id);
    await store.saveDocumentBlob(document.id, 'source', Buffer.from('%PDF-demo'), {
      fileName: 'Demo.pdf',
      contentType: 'application/pdf',
    });

    const bootstrap = await store.bootstrap();
    expect(bootstrap.library).toHaveLength(1);
    expect(bootstrap.activeDocumentId).toBe(document.id);
    const blob = await store.getDocumentBlob(document.id, 'source');
    expect(blob.buffer.toString('utf8')).toBe('%PDF-demo');
    expect(blob.fileName).toBe('Demo.pdf');

    await store.deleteDocument(document.id);
    expect(await store.getLibrary()).toEqual([]);
    expect(await store.getActiveDocumentId()).toBeNull();
    expect(await store.getDocumentBlob(document.id, 'source')).toBeNull();
  });
});
