import { describe, expect, it } from 'vitest';
import { parseDebugFlagsFromSearch } from './debug';

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
