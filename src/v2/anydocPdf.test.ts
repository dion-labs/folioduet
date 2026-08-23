import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractPdfWithAnydoc,
  normalizeAnydocMarkdown,
  repairAnydocWrapHyphenation,
} from './anydocPdf';

describe('repairAnydocWrapHyphenation', () => {
  it('joins wrapped words when the document contains strong lexical evidence', () => {
    const result = repairAnydocWrapHyphenation(
      'Architecture shapes systems. Good archi- tecture makes change easier.',
    );

    expect(result.markdown).toBe(
      'Architecture shapes systems. Good architecture makes change easier.',
    );
    expect(result.stats).toEqual({ candidates: 1, joined: 1, retained: 0, skipped: 0 });
  });

  it('repairs spacing but retains uncertain or evidenced compound hyphens', () => {
    const result = repairAnydocWrapHyphenation([
      'Prefer a long- term view.',
      'A recreation differs from re- creation, and re-creation appears elsewhere.',
    ].join('\n'));

    expect(result.markdown).toBe([
      'Prefer a long-term view.',
      'A recreation differs from re-creation, and re-creation appears elsewhere.',
    ].join('\n'));
    expect(result.stats).toEqual({ candidates: 2, joined: 0, retained: 2, skipped: 0 });
  });

  it('leaves Markdown code, link destinations, URLs, and tables untouched', () => {
    const markdown = [
      '`archi- tecture` and https://example.com/archi- tecture',
      '[guide](https://example.com/archi- tecture)',
      '| archi- tecture | value |',
      '```text',
      'archi- tecture',
      '```',
    ].join('\n');
    const result = repairAnydocWrapHyphenation(markdown);

    expect(result.markdown).toBe(markdown);
    expect(result.stats).toEqual({ candidates: 5, joined: 0, retained: 0, skipped: 5 });
  });
});

describe('normalizeAnydocMarkdown', () => {
  it('normalizes line endings and emits one continuous source document', () => {
    expect(normalizeAnydocMarkdown('# Chapter\r\n\r\nA paragraph.')).toEqual([
      '# Chapter\n\nA paragraph.\n',
    ]);
  });

  it('applies conservative wrap repair to converted AnyDoc Markdown', () => {
    expect(normalizeAnydocMarkdown(
      'Architecture matters.\n\nGood archi- tecture lasts.',
    )).toEqual([
      'Architecture matters.\n\nGood architecture lasts.\n',
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
