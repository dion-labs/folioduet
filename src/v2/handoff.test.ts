import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHandoffUrl,
  clearPendingHandoff,
  loadPendingHandoff,
  parseHandoffFromSearch,
  savePendingHandoff,
} from './handoff';

describe('handoff urls', () => {
  it('builds a deep link with page and optional offsets', () => {
    const url = buildHandoffUrl('https://pageecho.example/', {
      documentId: 'doc-1',
      pageIndex: 11,
      blockIndex: 2,
      wordIndex: 5,
    });
    expect(url).toBe('https://pageecho.example/?d=doc-1&p=11&b=2&w=5');
  });

  it('omits zero block/word params', () => {
    const url = buildHandoffUrl('https://pageecho.example', {
      documentId: 'doc-1',
      pageIndex: 0,
      blockIndex: 0,
      wordIndex: 0,
    });
    expect(url).toBe('https://pageecho.example/?d=doc-1&p=0');
  });

  it('parses handoff targets from the query string', () => {
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

describe('pending handoff storage', () => {
  afterEach(() => {
    clearPendingHandoff();
    vi.unstubAllGlobals();
  });

  it('persists and clears a pending handoff', () => {
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
    });
    expect(loadPendingHandoff()).toEqual({
      documentId: 'book-9',
      pageIndex: 4,
      blockIndex: 1,
      wordIndex: 2,
    });

    clearPendingHandoff();
    expect(loadPendingHandoff()).toBeNull();
  });
});
