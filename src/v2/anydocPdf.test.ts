import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPdfWithAnydoc } from './anydocPdf';

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

    expect(result).toEqual(['# Better heading\n\nClean text.']);
    expect(postMessage).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
  });
});
