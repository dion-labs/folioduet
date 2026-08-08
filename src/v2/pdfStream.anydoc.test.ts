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

import { extractPdfMarkdown, extractPdfMarkdownPages } from './pdfStream';

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

  it('reports which extractor produced the text', async () => {
    mocks.extractPdfWithAnydoc.mockResolvedValue(['# Chapter\n\nText.\n']);
    const file = new File(['pdf'], 'book.pdf', { type: 'application/pdf' });

    await expect(extractPdfMarkdown(file, 'anydoc')).resolves.toEqual({
      pages: ['# Chapter\n\nText.\n'],
      requested: 'anydoc',
      used: 'anydoc',
      didFallback: false,
    });
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

  it('reports when AnyDoc fell back to PDF.js', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.extractPdfWithAnydoc.mockRejectedValue(new Error('unsupported'));
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getTextContent: vi.fn().mockResolvedValue({
            items: [{ str: 'Fallback text.', hasEOL: true }],
          }),
        }),
        destroy: vi.fn(),
      }),
    });
    const file = new File(['pdf'], 'book.pdf', { type: 'application/pdf' });

    await expect(extractPdfMarkdown(file, 'anydoc')).resolves.toMatchObject({
      requested: 'anydoc',
      used: 'pageecho',
      didFallback: true,
    });
  });
});
