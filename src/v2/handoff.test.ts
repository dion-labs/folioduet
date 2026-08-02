import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHandoffUrl,
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
