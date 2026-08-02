import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  TELL_TALE_DEFAULT_AUDIO_PROVIDER,
  TELL_TALE_DEFAULT_AUDIO_VOICE_ID,
  TELL_TALE_SAMPLE_ID,
} from '../catalog/constants';
import { getFirebaseDb } from './app';
import {
  pageechoCatalogAudioPath,
  pageechoCatalogPagesPath,
  pageechoCatalogSamplePath,
} from './paths';

export type CatalogAudioClip = {
  text: string;
  provider: string;
  voiceId: string;
  mime: string;
  audioContent: string;
};

function sampleRef(sampleId: string) {
  return doc(getFirebaseDb(), ...pageechoCatalogSamplePath(sampleId));
}

function pagesCol(sampleId: string) {
  return collection(getFirebaseDb(), ...pageechoCatalogPagesPath(sampleId));
}

function audioCol(sampleId: string) {
  return collection(getFirebaseDb(), ...pageechoCatalogAudioPath(sampleId));
}

function pageKey(pageIndex: number): string {
  return String(pageIndex).padStart(6, '0');
}

/** Stable Firestore doc id for a text clip (short SHA-256 hex). */
export async function catalogAudioDocId(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40);
}

export async function fetchCatalogSamplePages(
  sampleId: string,
): Promise<Array<{ pageIndex: number; markdown: string }> | null> {
  const meta = await getDoc(sampleRef(sampleId));
  if (!meta.exists()) return null;
  const snap = await getDocs(query(pagesCol(sampleId), orderBy('pageIndex', 'asc')));
  if (snap.empty) return null;
  return snap.docs.map((item) => {
    const data = item.data();
    return {
      pageIndex: Number(data.pageIndex),
      markdown: String(data.markdown ?? ''),
    };
  });
}

/** Idempotent seed of shared sample markdown (not per-user library pages). */
export async function ensureCatalogSamplePages(
  sampleId: string,
  pages: string[],
  meta: { title: string },
): Promise<void> {
  if (pages.length === 0) return;
  const existing = await getDoc(sampleRef(sampleId));
  if (existing.exists() && Number(existing.data()?.pageCount) === pages.length) {
    return;
  }

  const batchSize = 400;
  for (let offset = 0; offset < pages.length; offset += batchSize) {
    const batch = writeBatch(getFirebaseDb());
    const slice = pages.slice(offset, offset + batchSize);
    for (let index = 0; index < slice.length; index += 1) {
      const pageIndex = offset + index;
      batch.set(doc(pagesCol(sampleId), pageKey(pageIndex)), {
        pageIndex,
        markdown: slice[index],
        updatedAt: Date.now(),
      });
    }
    await batch.commit();
  }

  await setDoc(
    sampleRef(sampleId),
    {
      sampleId,
      title: meta.title,
      pageCount: pages.length,
      defaultAudioProvider: TELL_TALE_DEFAULT_AUDIO_PROVIDER,
      defaultAudioVoiceId: TELL_TALE_DEFAULT_AUDIO_VOICE_ID,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

export async function fetchCatalogAudioClips(sampleId: string): Promise<CatalogAudioClip[]> {
  const snap = await getDocs(audioCol(sampleId));
  return snap.docs.map((item) => {
    const data = item.data();
    return {
      text: String(data.text ?? ''),
      provider: String(data.provider ?? TELL_TALE_DEFAULT_AUDIO_PROVIDER),
      voiceId: String(data.voiceId ?? TELL_TALE_DEFAULT_AUDIO_VOICE_ID),
      mime: String(data.mime ?? 'audio/mpeg'),
      audioContent: String(data.audioContent ?? ''),
    };
  }).filter((clip) => clip.text && clip.audioContent);
}

/**
 * Publish a clip into the shared catalog once (create-only).
 * Later listeners reuse it without calling Fish.
 */
export async function publishCatalogAudioClip(
  sampleId: string,
  clip: CatalogAudioClip,
): Promise<void> {
  if (!clip.text || !clip.audioContent) return;
  const id = await catalogAudioDocId(`${clip.provider}\0${clip.voiceId}\0${clip.text}`);
  const ref = doc(audioCol(sampleId), id);
  const existing = await getDoc(ref);
  if (existing.exists()) return;
  await setDoc(ref, {
    text: clip.text,
    provider: clip.provider,
    voiceId: clip.voiceId,
    mime: clip.mime || 'audio/mpeg',
    audioContent: clip.audioContent,
    updatedAt: Date.now(),
  });
}

export function isTellTaleSampleId(sampleId: string | undefined | null): boolean {
  return sampleId === TELL_TALE_SAMPLE_ID;
}
