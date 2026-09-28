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
  it.each([
    [1], [0, 0], [0, 2, 1], [0, -1], [0, 1.5], [0, '1'],
    [0, null], [0, 4], [0, 999], [],
  ])('rejects corrupt persisted boundaries %j and preserves source content', (...starts) => {
    const stream = [block('a'), block('b'), block('c'), block('d')];
    const fingerprint = streamFingerprint(stream);
    localStorage.setItem('pageecho-viewport-pack-v1:bad', JSON.stringify({
      v: 1, fingerprint, packKey: 'viewport', pageStarts: starts,
    }));
    expect(loadViewportPackCache('bad', fingerprint, 'viewport', stream.length)).toBeNull();
    expect(pagesFromStarts(stream, starts as number[]).flat()).toEqual(stream);
  });

  it('invalidates same-count content edits outside sampled blocks', () => {
    const original = ['a', 'b', 'c', 'd', 'e'].map((key) => block(key));
    const edited = original.map((entry) => ({ ...entry }));
    edited[1].text = 'wide '.repeat(10).trim();
    edited[1].markdown = edited[1].text;
    expect(streamFingerprint(edited)).not.toBe(streamFingerprint(original));
    saveViewportPackCache('edited', streamFingerprint(original), 'viewport', [0, 2]);
    expect(loadViewportPackCache('edited', streamFingerprint(edited), 'viewport', 5)).toBeNull();
  });

  it('retains valid and empty-stream packs', () => {
    const stream = [block('a'), block('b')];
    saveViewportPackCache('valid', streamFingerprint(stream), 'viewport', [0, 1]);
    expect(loadViewportPackCache('valid', streamFingerprint(stream), 'viewport', 2)?.pageStarts).toEqual([0, 1]);
    expect(pagesFromStarts([], [0])).toEqual([[]]);
  });

  it('treats denied or malformed storage as a cache miss', () => {
    localStorage.setItem('pageecho-viewport-pack-v1:broken', '{invalid json');
    expect(loadViewportPackCache('broken', 'fingerprint', 'viewport', 2)).toBeNull();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!;
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => { throw new Error('synthetic storage denied'); },
      });
      expect(loadViewportPackCache('blocked', 'fingerprint', 'viewport', 2)).toBeNull();
      expect(() => saveViewportPackCache('blocked', 'fingerprint', 'viewport', [0])).not.toThrow();
      expect(() => clearViewportPackCache('blocked')).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor);
    }
  });

});
