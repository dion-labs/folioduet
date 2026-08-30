import { describe, expect, it } from 'vitest';
import { hasDebugQueryParam, parseDebugFlagsFromSearch, readTestVolumeOverride } from './debug';

describe('readTestVolumeOverride', () => {
  it('allows silent local playback tests without muting production links', () => {
    expect(readTestVolumeOverride('?testVolume=0', true)).toBe(0);
    expect(readTestVolumeOverride('?testVolume=0.35', true)).toBe(0.35);
    expect(readTestVolumeOverride('?testVolume=0', false)).toBeNull();
  });

  it('ignores invalid values and clamps valid values to the audio range', () => {
    expect(readTestVolumeOverride('?testVolume=loud', true)).toBeNull();
    expect(readTestVolumeOverride('?testVolume=2', true)).toBe(1);
    expect(readTestVolumeOverride('?testVolume=-1', true)).toBe(0);
  });
});

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
