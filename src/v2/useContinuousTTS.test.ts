import { describe, expect, it } from 'vitest';
import { buildTtsLookAhead } from './useContinuousTTS';

describe('buildTtsLookAhead', () => {
  it('prioritizes the next two current-page blocks and the following page', () => {
    expect(buildTtsLookAhead(
      ['current', 'next block', '', 'following block', 'later block'],
      0,
      ['', 'next page first', 'next page second'],
    )).toEqual([
      'next block',
      'following block',
      'next page first',
    ]);
  });

  it('warms the start of the current and following pages before playback', () => {
    expect(buildTtsLookAhead(
      ['', 'first current', 'second current', 'third current'],
      -1,
      ['first next page'],
    )).toEqual([
      'first current',
      'second current',
      'first next page',
    ]);
  });

  it('still includes the next page when the current page has ended', () => {
    expect(buildTtsLookAhead(
      ['only current block'],
      0,
      ['', 'next page speech'],
    )).toEqual(['next page speech']);
  });

  it('returns no work when neither page has speakable text', () => {
    expect(buildTtsLookAhead(['', '  '], -1, ['', '\n'])).toEqual([]);
  });
});
