import { describe, expect, it } from 'vitest';
import { hasDebugQueryParam, parseDebugFlagsFromSearch } from './debug';

describe('hasDebugQueryParam', () => {
  it('only enables debug controls for an explicit query parameter', () => {
    expect(hasDebugQueryParam('')).toBe(false);
    expect(hasDebugQueryParam('?intent=import')).toBe(false);
    expect(hasDebugQueryParam('?debug')).toBe(true);
    expect(hasDebugQueryParam('?debug=cache')).toBe(true);
  });
});

describe('parseDebugFlagsFromSearch', () => {
  it('returns empty when debug is absent', () => {
    expect(parseDebugFlagsFromSearch('')).toEqual(new Set());
    expect(parseDebugFlagsFromSearch('?foo=1')).toEqual(new Set());
  });

  it('expands debug=1 to all scopes', () => {
    const flags = parseDebugFlagsFromSearch('?debug=1');
    expect(flags.has('all')).toBe(true);
    expect(flags.has('resume')).toBe(true);
    expect(flags.has('hydrate')).toBe(true);
  });

  it('parses comma-separated scopes', () => {
    expect(parseDebugFlagsFromSearch('?debug=resume,pack')).toEqual(
      new Set(['resume', 'pack']),
    );
  });
});
