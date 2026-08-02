import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { normalizeDocument } from '../storage';
import type { LibraryDocument, ReaderPreferences } from '../types';
import type { SyncBootstrap, SyncedPreferences, SyncSecretsStatus } from '../syncClient';
import { getFirebaseDb } from './app';
import { trackEvent } from './analytics';
import {
  pageechoDocumentPath,
  pageechoLibraryPath,
  pageechoPagesPath,
  pageechoSecretsPath,
  pageechoUserPath,
} from './paths';

type PrefsWithoutKeys = Omit<ReaderPreferences, 'inworldApiKey' | 'fishAudioApiKey'>;

function userRef(uid: string) {
  return doc(getFirebaseDb(), ...pageechoUserPath(uid));
}

function libraryCol(uid: string) {
  return collection(getFirebaseDb(), ...pageechoLibraryPath(uid));
}

function secretsRef(uid: string) {
  return doc(getFirebaseDb(), ...pageechoSecretsPath(uid));
}

function pagesCol(uid: string, documentId: string) {
  return collection(getFirebaseDb(), ...pageechoPagesPath(uid, documentId));
}

function documentRef(uid: string, documentId: string) {
  return doc(getFirebaseDb(), ...pageechoDocumentPath(uid, documentId));
}

function pageKey(pageIndex: number): string {
  return String(pageIndex).padStart(6, '0');
}

export async function fetchFirebaseBootstrap(uid: string): Promise<SyncBootstrap> {
  const snap = await getDoc(userRef(uid));
  const data = snap.data() ?? {};
  const preferences = (data.preferences ?? {}) as SyncedPreferences;
  const activeDocumentId =
    typeof data.activeDocumentId === 'string' ? data.activeDocumentId : null;

  const librarySnap = await getDocs(libraryCol(uid));
  const library = librarySnap.docs
    .map((item) => normalizeDocument({ id: item.id, ...item.data() }))
    .filter((document): document is LibraryDocument => document !== null);

  const secretsSnap = await getDoc(secretsRef(uid));
  const secretsData = secretsSnap.data() ?? {};
  const secrets: SyncSecretsStatus = {
    inworldConfigured: typeof secretsData.inworldApiKey === 'string' && secretsData.inworldApiKey.length > 0,
    fishAudioConfigured:
      typeof secretsData.fishAudioApiKey === 'string' && secretsData.fishAudioApiKey.length > 0,
  };

  return { preferences, library, activeDocumentId, secrets };
}

export async function putFirebasePreferences(
  uid: string,
  preferences: PrefsWithoutKeys & { updatedAt?: number },
): Promise<SyncedPreferences> {
  const next = { ...preferences, updatedAt: preferences.updatedAt ?? Date.now() };
  await setDoc(
    userRef(uid),
    { preferences: next, updatedAt: Date.now() },
    { merge: true },
  );
  return next;
}

export async function putFirebaseLibrary(
  uid: string,
  documents: LibraryDocument[],
  activeDocumentId: string | null,
): Promise<{ documents: LibraryDocument[]; activeDocumentId: string | null }> {
  const batch = writeBatch(getFirebaseDb());
  const existing = await getDocs(libraryCol(uid));
  const keep = new Set(documents.map((document) => document.id));

  for (const item of existing.docs) {
    if (!keep.has(item.id)) {
      batch.delete(item.ref);
    }
  }

  for (const document of documents) {
    const { url: _url, ...cloudDoc } = document;
    const hasProcessed = document.hasProcessedContent === true
      || document.kind === 'markdown-zip';
    batch.set(documentRef(uid, document.id), {
      ...cloudDoc,
      hasProcessedContent: hasProcessed,
      processedFormat: hasProcessed
        ? (document.processedFormat ?? 'markdown-pages')
        : null,
    }, { merge: true });
  }

  batch.set(userRef(uid), { activeDocumentId, updatedAt: Date.now() }, { merge: true });
  await batch.commit();
  return { documents, activeDocumentId };
}

export async function putFirebaseSecrets(
  uid: string,
  input: {
    inworldApiKey?: string;
    fishAudioApiKey?: string;
    clearInworld?: boolean;
    clearFishAudio?: boolean;
  },
): Promise<SyncSecretsStatus> {
  const ref = secretsRef(uid);
  const existing = (await getDoc(ref)).data() ?? {};
  const next: {
    inworldApiKey?: string;
    fishAudioApiKey?: string;
    updatedAt: number;
  } = {
    updatedAt: Date.now(),
  };

  if (!input.clearInworld) {
    if (typeof input.inworldApiKey === 'string' && input.inworldApiKey.trim()) {
      next.inworldApiKey = input.inworldApiKey.trim();
    } else if (typeof existing.inworldApiKey === 'string') {
      next.inworldApiKey = existing.inworldApiKey;
    }
  }

  if (!input.clearFishAudio) {
    if (typeof input.fishAudioApiKey === 'string' && input.fishAudioApiKey.trim()) {
      next.fishAudioApiKey = input.fishAudioApiKey.trim();
    } else if (typeof existing.fishAudioApiKey === 'string') {
      next.fishAudioApiKey = existing.fishAudioApiKey;
    }
  }

  await setDoc(ref, next, { merge: false });
  return {
    inworldConfigured: typeof next.inworldApiKey === 'string' && next.inworldApiKey.length > 0,
    fishAudioConfigured: typeof next.fishAudioApiKey === 'string' && next.fishAudioApiKey.length > 0,
  };
}

export async function readFirebaseSecrets(uid: string): Promise<{
  inworldApiKey: string;
  fishAudioApiKey: string;
}> {
  const data = (await getDoc(secretsRef(uid))).data() ?? {};
  return {
    inworldApiKey: typeof data.inworldApiKey === 'string' ? data.inworldApiKey : '',
    fishAudioApiKey: typeof data.fishAudioApiKey === 'string' ? data.fishAudioApiKey : '',
  };
}

export async function uploadProcessedPages(
  uid: string,
  documentId: string,
  pages: Array<{ pageIndex: number; markdown: string }>,
): Promise<void> {
  const batchSize = 400;
  for (let offset = 0; offset < pages.length; offset += batchSize) {
    const batch = writeBatch(getFirebaseDb());
    const slice = pages.slice(offset, offset + batchSize);
    for (const page of slice) {
      batch.set(doc(pagesCol(uid, documentId), pageKey(page.pageIndex)), {
        pageIndex: page.pageIndex,
        markdown: page.markdown,
        updatedAt: Date.now(),
      });
    }
    await batch.commit();
  }

  await setDoc(
    documentRef(uid, documentId),
    {
      hasProcessedContent: true,
      processedFormat: 'markdown-pages',
      totalPages: pages.length,
      updatedAt: Date.now(),
    },
    { merge: true },
  );

  await trackEvent('import_book', { kind: 'processed-pages', page_count: pages.length });
}

export async function fetchProcessedPages(
  uid: string,
  documentId: string,
): Promise<Array<{ pageIndex: number; markdown: string }>> {
  const snap = await getDocs(query(pagesCol(uid, documentId), orderBy('pageIndex', 'asc')));
  return snap.docs.map((item) => {
    const data = item.data();
    return {
      pageIndex: Number(data.pageIndex),
      markdown: String(data.markdown ?? ''),
    };
  });
}

export async function deleteFirebaseDocument(uid: string, documentId: string): Promise<void> {
  const pages = await getDocs(pagesCol(uid, documentId));
  const batch = writeBatch(getFirebaseDb());
  for (const page of pages.docs) batch.delete(page.ref);
  batch.delete(documentRef(uid, documentId));
  await batch.commit();
  // Extra pages beyond one batch are rare for v1; clean leftovers if needed.
  const leftovers = await getDocs(pagesCol(uid, documentId));
  for (const page of leftovers.docs) {
    await deleteDoc(page.ref);
  }
}
