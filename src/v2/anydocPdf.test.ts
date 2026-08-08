import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPdfWithAnydoc, normalizeAnydocMarkdown } from './anydocPdf';

describe('normalizeAnydocMarkdown', () => {
  it('normalizes line endings and emits one continuous source document', () => {
    expect(normalizeAnydocMarkdown('# Chapter\r\n\r\nA paragraph.')).toEqual([
      '# Chapter\n\nA paragraph.\n',
    ]);
  });

  it('does not emit an empty document', () => {
    expect(normalizeAnydocMarkdown('  \n ')).toEqual([]);
  });
});

describe('extractPdfWithAnydoc', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('transfers PDF bytes to the worker and terminates it after conversion', async () => {
    const terminate = vi.fn();
    const postMessage = vi.fn(function (this: Worker, message: { id: number }) {
      this.onmessage?.({
        data: { id: message.id, markdown: '# Better heading\n\nClean text.' },
      } as MessageEvent);
    });
    class FakeWorker {
      onmessage: Worker['onmessage'] = null;
      onerror: Worker['onerror'] = null;
      postMessage = postMessage;
      terminate = terminate;
    }
    vi.stubGlobal('Worker', FakeWorker);

    const result = await extractPdfWithAnydoc(
      new File([new Uint8Array([1, 2, 3])], 'book.pdf', { type: 'application/pdf' }),
    );

    expect(result).toEqual(['# Better heading\n\nClean text.\n']);
    expect(postMessage).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
  });
});
