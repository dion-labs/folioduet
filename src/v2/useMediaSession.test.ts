import { describe, expect, it } from 'vitest';
import { toMediaSessionPlayback } from './useMediaSession';

describe('toMediaSessionPlayback', () => {
  it('maps TTS states onto Media Session playbackState', () => {
    expect(toMediaSessionPlayback('idle')).toBe('none');
    expect(toMediaSessionPlayback('paused')).toBe('paused');
    expect(toMediaSessionPlayback('playing')).toBe('playing');
    expect(toMediaSessionPlayback('buffering')).toBe('playing');
  });
});
