import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHandoffUrl,
  clearHandoffFromUrl,
  getHandoffGlobalWordIndex,
  resolveHandoffGlobalWordIndex,
  clearPendingHandoff,
  loadPendingHandoff,
  parseHandoffFromSearch,
  resolveHandoffStreamIndex,
  savePendingHandoff,
} from './handoff';

describe('handoff urls', () => {
  it('builds a deep link with stream index and optional offsets', () => {
    const url = buildHandoffUrl('https://pageecho.example/', {
      documentId: 'doc-1',
      pageIndex: 11,
      blockIndex: 2,
      wordIndex: 5,
      streamIndex: 48,
    });
    expect(url).toBe('https://pageecho.example/?d=doc-1&p=11&s=48&b=2&w=5');
  });

  it('omits zero block/word params but keeps stream index', () => {
    const url = buildHandoffUrl('https://pageecho.example', {
      documentId: 'doc-1',
      pageIndex: 0,
      blockIndex: 0,
      wordIndex: 0,
      streamIndex: 0,
    });
    expect(url).toBe('https://pageecho.example/?d=doc-1&p=0&s=0');
  });

  it('parses handoff targets including stream index', () => {
    expect(parseHandoffFromSearch('?d=abc&p=3&b=1&w=8&s=22')).toEqual({
      documentId: 'abc',
      pageIndex: 3,
      blockIndex: 1,
      wordIndex: 8,
      streamIndex: 22,
    });
  });

  it('parses legacy links without stream index', () => {
    expect(parseHandoffFromSearch('?d=abc&p=3&b=1&w=8')).toEqual({
      documentId: 'abc',
      pageIndex: 3,
      blockIndex: 1,
      wordIndex: 8,
    });
  });

  it('returns null when document id is missing', () => {
    expect(parseHandoffFromSearch('?p=2')).toBeNull();
  });
});

describe('resolveHandoffStreamIndex', () => {
  it('prefers the explicit stream index', () => {
    expect(resolveHandoffStreamIndex({
      documentId: 'd',
      pageIndex: 2,
      blockIndex: 1,
      wordIndex: 0,
      streamIndex: 40,
    }, [0, 10, 20])).toBe(40);
  });

  it('falls back to page start + local block for legacy links', () => {
    expect(resolveHandoffStreamIndex({
      documentId: 'd',
      pageIndex: 2,
      blockIndex: 1,
      wordIndex: 0,
    }, [0, 10, 20])).toBe(21);
  });
});

describe('pending handoff storage', () => {
  afterEach(() => {
    clearPendingHandoff();
    vi.unstubAllGlobals();
  });

  it('persists and clears a pending handoff including stream index', () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    });

    savePendingHandoff({
      documentId: 'book-9',
      pageIndex: 4,
      blockIndex: 1,
      wordIndex: 2,
      streamIndex: 33,
    });
    expect(loadPendingHandoff()).toEqual({
      documentId: 'book-9',
      pageIndex: 4,
      blockIndex: 1,
      wordIndex: 2,
      streamIndex: 33,
    });

    clearPendingHandoff();
    expect(loadPendingHandoff()).toBeNull();
  });

  it('loads legacy stored handoffs that omit stream index', () => {
    const memory = new Map<string, string>();
    memory.set('pageecho-pending-handoff', JSON.stringify({
      documentId: 'book-9',
      pageIndex: 4,
      blockIndex: 1,
      wordIndex: 2,
    }));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    });

    expect(loadPendingHandoff()).toEqual({
      documentId: 'book-9',
      pageIndex: 4,
      blockIndex: 1,
      wordIndex: 2,
    });
  });
});


describe('malformed handoff recovery', () => {
  it.each(['', '-1', '12junk', '1.5', '1e3', 'Infinity', '9007199254740992']) (
    'ignores invalid stream index %s and retains the legacy page anchor', (invalid) => {
      const target = parseHandoffFromSearch(`?d=fixture&p=2&b=1&s=${invalid}`)!;
      expect(target.streamIndex).toBeUndefined();
      expect(resolveHandoffStreamIndex(target, [0, 10, 20])).toBe(21);
    },
  );

  it('defaults malformed required offsets without accepting numeric prefixes', () => {
    expect(parseHandoffFromSearch('?d=fixture&p=2oops&b=3.5&w=4e2')).toEqual({
      documentId: 'fixture', pageIndex: 0, blockIndex: 0, wordIndex: 0,
    });
  });

  it('does not generate nonfinite or unsafe numeric URL fields', () => {
    const url = buildHandoffUrl('https://example.test/', {
      documentId: 'fixture', pageIndex: NaN, blockIndex: Infinity,
      wordIndex: Number.MAX_SAFE_INTEGER + 1, streamIndex: -1,
    });
    expect(url).toBe('https://example.test/?d=fixture&p=0');
  });
});


describe('word-based handoff compatibility', () => {
  const block = (words: number) => ({ text: Array.from({ length: words }, (_, i) => `word${i}`).join(' ') });
  afterEach(() => vi.unstubAllGlobals());
  it('round-trips an optional zero word offset alongside legacy anchors', () => {
    const target = { documentId: 'd', pageIndex: 4, blockIndex: 0, wordIndex: 2, streamIndex: 8, globalWordIndex: 0 };
    expect(parseHandoffFromSearch(new URL(buildHandoffUrl('https://folio.test', target)).search)).toEqual(target);
  });
  it('ignores malformed optional word offsets without losing legacy anchors', () => {
    for (const value of ['-1', '3.2', '4x', 'Infinity', '9007199254740992']) {
      expect(parseHandoffFromSearch(`?d=d&p=4&s=8&gw=${value}`)).toEqual({
        documentId: 'd', pageIndex: 4, blockIndex: 0, wordIndex: 0, streamIndex: 8,
      });
    }
  });
  it('preserves the optional word offset in a pending stored handoff', () => {
    const data = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) });
    const target = { documentId: 'd', pageIndex: 4, blockIndex: 0, wordIndex: 2, streamIndex: 8, globalWordIndex: 464 };
    savePendingHandoff(target);
    expect(loadPendingHandoff()).toEqual(target);
  });
  it('removes the consumed word offset while retaining unrelated URL state', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', { location: { href: 'https://folio.test/?d=d&p=4&s=8&gw=464&keep=1#reader' },
      history: { state: null, replaceState } });
    clearHandoffFromUrl();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?keep=1#reader');
  });
  it('maps every word across different viewport fragment/page boundaries', () => {
    const narrow = [[block(2)], [block(10)], [block(10)], [block(10)]];
    const wide = [[block(2)], [block(30)]];
    for (let offset = 0; offset < 32; offset++) {
      for (const pages of [narrow, wide]) {
        const position = resolveHandoffGlobalWordIndex(pages, offset)!;
        expect(getHandoffGlobalWordIndex(pages, position.streamIndex, position.wordIndex)).toBe(offset);
      }
    }
    expect(resolveHandoffGlobalWordIndex(wide, getHandoffGlobalWordIndex(narrow, 3, 4)!))
      .toEqual({ pageIndex: 1, blockIndex: 0, wordIndex: 24, streamIndex: 1 });
  });
  it('uses reader token indexes rather than whitespace counts', () => {
    const narrow = [[{ text: 'Hello,world!' }], [{ text: 'One—two three.' }]];
    const wide = [[{ text: 'Hello,world! One—two three.' }]];
    expect(getHandoffGlobalWordIndex(narrow, 1, 1)).toBe(3);
    expect(resolveHandoffGlobalWordIndex(wide, 3))
      .toEqual({ pageIndex: 0, blockIndex: 0, streamIndex: 0, wordIndex: 3 });
    expect(getHandoffGlobalWordIndex([[{ text: '...' }]], 0, 0)).toBeUndefined();
  });
  it('uses legacy fallback for out-of-range or invalid offsets and empty books', () => {
    for (const offset of [-1, 32, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(resolveHandoffGlobalWordIndex([[block(32)]], offset)).toBeNull();
    }
    expect(resolveHandoffGlobalWordIndex([], 0)).toBeNull();
    expect(getHandoffGlobalWordIndex([[block(32)]], 5, 0)).toBeUndefined();
  });
});
