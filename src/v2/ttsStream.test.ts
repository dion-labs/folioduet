import { describe, expect, it } from 'vitest';
import {
  buildTtsLookAhead,
  findSpeakableStreamBlock,
  resolveTtsStreamPosition,
  type TtsStreamBlock,
} from './ttsStream';

const stream = (...texts: string[]): TtsStreamBlock[] => texts.map((text, index) => ({
  key: `block-${index}`,
  text,
}));

describe('continuous TTS stream', () => {
  it('finds the next speakable block across empty entries', () => {
    expect(findSpeakableStreamBlock(stream('', '  ', 'next'), 0)).toBe(2);
    expect(findSpeakableStreamBlock(stream('done'), 1)).toBe(-1);
  });

  it('prefetches in stream order without page boundaries', () => {
    expect(buildTtsLookAhead(
      stream('current', 'next block', '', 'following block', 'later block'),
      0,
    )).toEqual(['next block', 'following block', 'later block']);
  });

  it('warms the start of the stream before playback', () => {
    expect(buildTtsLookAhead(stream('', 'first', 'second', 'third'), -1)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('maps a stream cursor back to UI-only page coordinates', () => {
    expect(resolveTtsStreamPosition([0, 2, 5], 4, 7)).toEqual({
      streamIndex: 4,
      pageIndex: 1,
      blockIndex: 2,
      wordIndex: 7,
    });
    expect(resolveTtsStreamPosition([], 3, -1)).toEqual({
      streamIndex: 3,
      pageIndex: 0,
      blockIndex: 3,
      wordIndex: 0,
    });
  });
});
