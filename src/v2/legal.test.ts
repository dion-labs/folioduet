import { describe, expect, it } from 'vitest';
import { parseLegalHash } from './legal';

describe('parseLegalHash', () => {
  it('accepts terms and privacy hashes', () => {
    expect(parseLegalHash('#terms')).toBe('terms');
    expect(parseLegalHash('privacy')).toBe('privacy');
  });

  it('rejects unknown hashes', () => {
    expect(parseLegalHash('#sponsor')).toBeNull();
    expect(parseLegalHash('')).toBeNull();
  });
});
