import { describe, expect, it } from 'vitest';
import {
  TELL_TALE_LIBRARY_DOC_ID,
  TELL_TALE_SAMPLE_ID,
  createTellTaleLibraryDocument,
  isCatalogSampleDocumentId,
} from './constants';

describe('catalog sample identity', () => {
  it('recognizes the shared sample document id', () => {
    expect(isCatalogSampleDocumentId(TELL_TALE_LIBRARY_DOC_ID)).toBe(true);
    expect(isCatalogSampleDocumentId('user-upload-123')).toBe(false);
  });

  it('builds a catalog-backed library stub', () => {
    const doc = createTellTaleLibraryDocument({
      totalPages: 12,
      currentPageIndex: 4,
      activeStreamIndex: 40,
    });
    expect(doc).toMatchObject({
      id: TELL_TALE_LIBRARY_DOC_ID,
      catalogSampleId: TELL_TALE_SAMPLE_ID,
      isSample: true,
      totalPages: 12,
      currentPageIndex: 4,
      activeStreamIndex: 40,
      hasProcessedContent: true,
    });
  });
});
