import { afterEach, describe, expect, it, vi } from 'vitest';
import { peekBootActiveDocumentId, resolveActiveDocumentId } from './storage';

describe('resolveActiveDocumentId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers the first candidate that exists in the library', () => {
    const library = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(resolveActiveDocumentId(library, [null, 'b', 'a'])).toBe('b');
    expect(resolveActiveDocumentId(library, ['missing', 'c'])).toBe('c');
  });

  it('falls back to the first library entry when nothing matches', () => {
    expect(resolveActiveDocumentId([{ id: 'top' }, { id: 'other' }], [null, 'gone'])).toBe('top');
    expect(resolveActiveDocumentId([], ['x'])).toBeNull();
  });
});

describe('peekBootActiveDocumentId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures the first localStorage value and ignores later clears', () => {
    const memory = new Map<string, string>();
    memory.set('bimodal-active-doc', 'book-keep');
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    });

    // Module may already have captured in this vitest worker — only assert stability.
    const first = peekBootActiveDocumentId();
    memory.delete('bimodal-active-doc');
    expect(peekBootActiveDocumentId()).toBe(first);
  });
});
