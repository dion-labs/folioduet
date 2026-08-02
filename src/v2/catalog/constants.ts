import type { LibraryDocument } from '../types';

/** Stable shared sample identity (content lives under pageecho/catalog, not per-user pages). */
export const TELL_TALE_SAMPLE_ID = 'tell-tale-heart';

/** Every user's library stub for the sample uses this fixed document id. */
export const TELL_TALE_LIBRARY_DOC_ID = 'sample:tell-tale-heart';

/** True when a handoff/library id points at the shared catalog sample (guest-safe). */
export function isCatalogSampleDocumentId(documentId: string): boolean {
  return documentId === TELL_TALE_LIBRARY_DOC_ID;
}

/** Default Fish voice used for shared sample audio clips. */
export const TELL_TALE_DEFAULT_AUDIO_PROVIDER = 'fish-audio' as const;
export const TELL_TALE_DEFAULT_AUDIO_VOICE_ID = '933563129e564b19a115bedd57b7406a';

/** Library stub for the shared sample — content loads from the public catalog. */
export function createTellTaleLibraryDocument(
  overrides: Partial<LibraryDocument> = {},
): LibraryDocument {
  const now = Date.now();
  return {
    name: 'The Tell-Tale Heart',
    kind: 'markdown-zip',
    sourceName: 'The Tell-Tale Heart.zip',
    totalPages: 1,
    currentPageIndex: 0,
    activeBlockIndex: 0,
    activeWordIndex: 0,
    updatedAt: now,
    addedAt: now,
    hasProcessedContent: true,
    processedFormat: 'markdown-pages',
    ...overrides,
    id: TELL_TALE_LIBRARY_DOC_ID,
    isSample: true,
    catalogSampleId: TELL_TALE_SAMPLE_ID,
  };
}
