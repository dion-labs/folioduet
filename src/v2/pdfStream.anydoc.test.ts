import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extractPdfWithAnydoc: vi.fn(),
  getDocument: vi.fn(),
}));

vi.mock('./anydocPdf', () => ({
  extractPdfWithAnydoc: mocks.extractPdfWithAnydoc,
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: 'test-worker' },
  getDocument: mocks.getDocument,
}));

import { extractPdfMarkdownPages } from './pdfStream';

describe('AnyDoc PDF extraction', () => {
  beforeEach(() => {
    mocks.extractPdfWithAnydoc.mockReset();
    mocks.getDocument.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses AnyDoc when selected', async () => {
    mocks.extractPdfWithAnydoc.mockResolvedValue(['# Chapter\n\nText.\n']);
    const file = new File(['pdf'], 'book.pdf', { type: 'application/pdf' });

    await expect(extractPdfMarkdownPages(file, 'anydoc')).resolves.toEqual([
      '# Chapter\n\nText.\n',
    ]);
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it('falls back to PDF.js when AnyDoc rejects the file', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.extractPdfWithAnydoc.mockRejectedValue(new Error('unsupported'));
    const destroy = vi.fn();
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getTextContent: vi.fn().mockResolvedValue({
            items: [{ str: 'Fallback text.', hasEOL: true }],
          }),
        }),
        destroy,
      }),
    });
    const file = new File(['pdf'], 'book.pdf', { type: 'application/pdf' });

    await expect(extractPdfMarkdownPages(file, 'anydoc')).resolves.toEqual([
      'Fallback text.\n',
    ]);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
