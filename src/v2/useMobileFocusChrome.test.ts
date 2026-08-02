import { describe, expect, it } from 'vitest';
import { classifyStageSwipe } from './useMobileFocusChrome';

describe('classifyStageSwipe', () => {
  it('turns the page on a clear horizontal swipe', () => {
    expect(classifyStageSwipe({ dx: -80, dy: 10, scrollDelta: 0 })).toBe('next');
    expect(classifyStageSwipe({ dx: 80, dy: -8, scrollDelta: 0 })).toBe('prev');
  });

  it('reveals chrome on a clear vertical swipe', () => {
    expect(classifyStageSwipe({ dx: 8, dy: 70, scrollDelta: 0 })).toBe('reveal-chrome');
  });

  it('treats a short clean touch as a tap', () => {
    expect(classifyStageSwipe({ dx: 4, dy: -3, scrollDelta: 0 })).toBe('tap');
  });

  it('ignores gestures that scrolled the page', () => {
    expect(classifyStageSwipe({ dx: -90, dy: 0, scrollDelta: 20 })).toBeNull();
  });
});
