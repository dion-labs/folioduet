import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveActiveDocumentId } from './storage';

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
