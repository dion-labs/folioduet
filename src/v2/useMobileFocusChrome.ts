import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';

const MOBILE_QUERY = '(max-width: 860px)';
const OPEN_FOCUS_DELAY_MS = 1400;
const PLAYING_HIDE_MS = 2800;
const SWIPE_THRESHOLD_PX = 52;

export type StageSwipeAction = 'next' | 'prev' | 'reveal-chrome' | 'tap';

/** Pure classifier — keeps page-turn / chrome gestures from fighting each other. */
export function classifyStageSwipe(input: {
  dx: number;
  dy: number;
  scrollDelta: number;
  threshold?: number;
}): StageSwipeAction | null {
  const threshold = input.threshold ?? SWIPE_THRESHOLD_PX;
  const { dx, dy, scrollDelta } = input;

  if (scrollDelta >= 8) return null;

  // Horizontal page turn (swipe left = next, swipe right = previous).
  if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.25) {
    return dx < 0 ? 'next' : 'prev';
  }

  // Vertical swipe reveals chrome (YouTube-style edge pull).
  if (Math.abs(dy) >= threshold && Math.abs(dy) > Math.abs(dx) * 1.25) {
    return 'reveal-chrome';
  }

  if (Math.abs(dx) < 14 && Math.abs(dy) < 14) {
    return 'tap';
  }

  return null;
}

interface UseMobileFocusChromeOptions {
  enabled: boolean;
  documentId: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  overlaysOpen: boolean;
  /** Horizontal swipe on the reading stage turns pages. */
  onHorizontalSwipe?: (direction: 'prev' | 'next') => void;
}

export function useMobileFocusChrome({
  enabled,
  documentId,
  isPlaying,
  isPaused,
  overlaysOpen,
  onHorizontalSwipe,
}: UseMobileFocusChromeOptions) {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  ));
  const [chromeVisible, setChromeVisible] = useState(true);
  const [interactionTick, setInteractionTick] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number; scrollTop: number } | null>(null);
  const onHorizontalSwipeRef = useRef(onHorizontalSwipe);
  onHorizontalSwipeRef.current = onHorizontalSwipe;
  const focusActive = enabled && isMobile;

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    setInteractionTick((tick) => tick + 1);
  }, []);

  const hideChrome = useCallback(() => {
    setChromeVisible(false);
  }, []);

  const toggleChrome = useCallback(() => {
    setChromeVisible((visible) => {
      const next = !visible;
      if (next) setInteractionTick((tick) => tick + 1);
      return next;
    });
  }, []);

  // Entering a book: brief chrome flash, then immersive focus.
  useEffect(() => {
    if (!focusActive || !documentId) {
      setChromeVisible(true);
      return;
    }
    setChromeVisible(true);
    const timer = window.setTimeout(() => setChromeVisible(false), OPEN_FOCUS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [focusActive, documentId]);

  // Keep chrome up while drawers/dialogs are open.
  useEffect(() => {
    if (!focusActive) return;
    if (overlaysOpen) setChromeVisible(true);
  }, [focusActive, overlaysOpen]);

  // Auto-hide while audio is actively playing and the user goes idle.
  useEffect(() => {
    if (!focusActive || !chromeVisible || overlaysOpen) return;
    if (!(isPlaying && !isPaused)) return;
    const timer = window.setTimeout(() => setChromeVisible(false), PLAYING_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [focusActive, chromeVisible, overlaysOpen, isPlaying, isPaused, interactionTick]);

  const onStageTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    // Track touches whenever a document is open so page swipes work even outside focus mode.
    if (!enabled) return;
    const touch = event.touches[0];
    if (!touch) return;
    const scroller = (event.target as HTMLElement | null)?.closest('.pe-reading-wrap, .pe-single-pdf, .pe-pane');
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      scrollTop: scroller instanceof HTMLElement ? scroller.scrollTop : 0,
    };
  }, [enabled]);

  const onStageTouchEnd = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (!enabled || !touchStartRef.current) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const start = touchStartRef.current;
    touchStartRef.current = null;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const scroller = (event.target as HTMLElement | null)?.closest('.pe-reading-wrap, .pe-single-pdf, .pe-pane');
    const scrollDelta = scroller instanceof HTMLElement
      ? Math.abs(scroller.scrollTop - start.scrollTop)
      : 0;

    const action = classifyStageSwipe({ dx, dy, scrollDelta });
    if (!action) return;

    if (action === 'next' || action === 'prev') {
      onHorizontalSwipeRef.current?.(action);
      return;
    }

    if (!focusActive) return;

    if (action === 'reveal-chrome') {
      revealChrome();
      return;
    }

    // Clean tap on non-interactive surface toggles chrome.
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, label, select, textarea, .pe-word')) return;
    toggleChrome();
  }, [enabled, focusActive, revealChrome, toggleChrome]);

  const onChromePointerDown = useCallback(() => {
    if (!focusActive) return;
    revealChrome();
  }, [focusActive, revealChrome]);

  return {
    focusActive,
    chromeVisible,
    revealChrome,
    hideChrome,
    toggleChrome,
    onStageTouchStart,
    onStageTouchEnd,
    onChromePointerDown,
  };
}
