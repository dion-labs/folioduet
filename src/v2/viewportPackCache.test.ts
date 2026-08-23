import { beforeEach, describe, expect, it } from 'vitest';
import type { BookStreamBlock } from './bookStream';
import {
  clearViewportPackCache,
  loadViewportPackCache,
  pagesFromStarts,
  saveViewportPackCache,
  streamFingerprint,
} from './viewportPackCache';

function block(key: string, words = 10): BookStreamBlock {
  const text = 'word '.repeat(words).trim();
  return {
    key,
    type: 'p',
    text,
    markdown: text,
    words,
    chapterBreak: false,
  };
}

describe('viewportPackCache', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
      },
    });
  });

  it('rebuilds pages from starts', () => {
    const stream = [block('a'), block('b'), block('c'), block('d')];
    const pages = pagesFromStarts(stream, [0, 2]);
    expect(pages).toEqual([[stream[0], stream[1]], [stream[2], stream[3]]]);
  });

  it('rejects cache when fingerprint or viewport key mismatch', () => {
    const stream = [block('a'), block('b')];
    const fingerprint = streamFingerprint(stream);
    saveViewportPackCache('doc-1', fingerprint, '2:400:500:1.00', [0, 1]);

    expect(loadViewportPackCache('doc-1', fingerprint, '2:400:500:1.00')?.pageStarts).toEqual([0, 1]);
    expect(loadViewportPackCache('doc-1', 'other', '2:400:500:1.00')).toBeNull();
    expect(loadViewportPackCache('doc-1', fingerprint, '2:480:500:1.00')).toBeNull();
  });

  it('clears the cached pack for one document', () => {
    const stream = [block('a'), block('b')];
    const fingerprint = streamFingerprint(stream);
    saveViewportPackCache('doc-1', fingerprint, '2:400:500:1.00', [0, 1]);
    saveViewportPackCache('doc-2', fingerprint, '2:400:500:1.00', [0, 1]);

    clearViewportPackCache('doc-1');

    expect(loadViewportPackCache('doc-1', fingerprint, '2:400:500:1.00')).toBeNull();
    expect(loadViewportPackCache('doc-2', fingerprint, '2:400:500:1.00')).not.toBeNull();
  });
});
