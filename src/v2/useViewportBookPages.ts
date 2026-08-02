import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import {
  expandStreamForBudget,
  findPageForStreamIndex,
  packStreamByHeight,
  packStreamByWords,
  type BookStreamBlock,
} from './bookStream';
import { DEFAULT_WORDS_PER_PAGE } from './documents';
import {
  createBookStreamMeasurer,
  measurePageBodyBudget,
  measurePageBodyContentWidth,
} from './measureBookStream';

type Anchor = {
  streamIndex: number;
  wordIndex: number;
};

type Options = {
  stream: BookStreamBlock[] | null;
  enabled: boolean;
  fontScale: number;
  stageRef: RefObject<HTMLElement | null>;
  pageBodyRef: RefObject<HTMLElement | null>;
  /** Content anchor preserved across viewport / font reflows. */
  anchorRef: MutableRefObject<Anchor>;
  onPageCount: (totalPages: number) => void;
  onRestorePage: (pageIndex: number, localBlockIndex: number, wordIndex: number) => void;
};

function quantize(value: number, step = 8): number {
  return Math.round(value / step) * step;
}

export function useViewportBookPages({
  stream,
  enabled,
  fontScale,
  stageRef,
  pageBodyRef,
  anchorRef,
  onPageCount,
  onRestorePage,
}: Options) {
  const [pages, setPages] = useState<BookStreamBlock[][]>([]);
  const [pageStarts, setPageStarts] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const packTimerRef = useRef<number | null>(null);
  const lastPackKeyRef = useRef('');
  const packingRef = useRef(false);

  // Keep latest callbacks without re-subscribing the pack effect (page-count
  // updates used to recreate these and re-enter an expensive pack loop).
  const onPageCountRef = useRef(onPageCount);
  const onRestorePageRef = useRef(onRestorePage);
  onPageCountRef.current = onPageCount;
  onRestorePageRef.current = onRestorePage;

  useEffect(() => {
    if (!enabled || !stream) {
      lastPackKeyRef.current = '';
      setPages([]);
      setPageStarts([]);
      setReady(false);
      return undefined;
    }

    if (stream.length === 0) {
      lastPackKeyRef.current = '';
      setPages([]);
      setPageStarts([]);
      setReady(true);
      onPageCountRef.current(1);
      return undefined;
    }

    lastPackKeyRef.current = '';

    const pack = () => {
      if (packingRef.current) return;
      const stage = stageRef.current;
      const body = pageBodyRef.current;
      const width = measurePageBodyContentWidth(body)
        || body?.clientWidth
        || stage?.clientWidth
        || Math.min(780, window.innerWidth - 48);
      let budget = measurePageBodyBudget(body, fontScale);

      // First paint: body may not have a settled height yet — estimate from stage.
      if (budget < 120 && stage) {
        const stageStyles = window.getComputedStyle(stage);
        const padY = (parseFloat(stageStyles.paddingTop) || 0) + (parseFloat(stageStyles.paddingBottom) || 0);
        const lineGuess = 16 * fontScale * 1.78;
        const safety = Math.max(28, Math.ceil(lineGuess * 1.25));
        // header+footer+page chrome ≈ 130px inside the cream card
        budget = Math.max(160, stage.clientHeight - padY - 130 - safety);
      }

      const packKey = `${stream.length}:${quantize(width)}:${quantize(budget)}:${fontScale.toFixed(2)}`;
      if (packKey === lastPackKeyRef.current) return;
      lastPackKeyRef.current = packKey;
      packingRef.current = true;

      let nextPages: BookStreamBlock[][];
      let nextStarts: number[];

      try {
        if (budget >= 120) {
          const measurer = createBookStreamMeasurer({ width, fontScale });
          try {
            // One host for the whole pass: heights → split oversizers → pack/peel.
            const heights = measurer.measureHeights(stream);
            const packable = expandStreamForBudget(
              stream,
              budget,
              measurer.measureBlock,
              heights,
            );
            const packHeights = packable.length === stream.length
              ? heights
              : measurer.measureHeights(packable);
            ({ pages: nextPages, pageStarts: nextStarts } = packStreamByHeight(
              packable,
              packHeights,
              budget,
              { measurePage: measurer.measurePage },
            ));
          } finally {
            measurer.dispose();
          }
        } else {
          ({ pages: nextPages, pageStarts: nextStarts } = packStreamByWords(
            stream,
            DEFAULT_WORDS_PER_PAGE,
          ));
        }

        if (nextPages.length === 0) {
          nextPages = [[]];
          nextStarts = [0];
        }

        setPages(nextPages);
        setPageStarts(nextStarts);
        setReady(true);
        onPageCountRef.current(nextPages.length);

        const anchor = anchorRef.current;
        const pageIndex = findPageForStreamIndex(nextStarts, anchor.streamIndex);
        const start = nextStarts[pageIndex] ?? 0;
        const localBlockIndex = Math.max(0, anchor.streamIndex - start);
        onRestorePageRef.current(pageIndex, localBlockIndex, anchor.wordIndex);
      } finally {
        packingRef.current = false;
      }
    };

    const schedule = () => {
      if (packTimerRef.current !== null) window.clearTimeout(packTimerRef.current);
      packTimerRef.current = window.setTimeout(pack, 60);
    };

    schedule();

    const stage = stageRef.current;
    // Observe the stage (viewport chrome), not the page body. Body descendant
    // changes from peels/page turns must not re-enter packing.
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => schedule())
      : null;
    if (stage) observer?.observe(stage);
    window.addEventListener('orientationchange', schedule);
    window.visualViewport?.addEventListener('resize', schedule);

    return () => {
      if (packTimerRef.current !== null) window.clearTimeout(packTimerRef.current);
      observer?.disconnect();
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [enabled, stream, fontScale, stageRef, pageBodyRef, anchorRef]);

  const peelOverflowFromPage = useCallback((pageIndex: number, removeCount = 1) => {
    setPages((current) => {
      if (pageIndex < 0 || pageIndex >= current.length) return current;
      const page = current[pageIndex];
      const count = Math.min(Math.max(1, removeCount), Math.max(0, page.length - 1));
      if (count <= 0) return current;

      const next = current.map((entry) => [...entry]);
      const moved = next[pageIndex].splice(next[pageIndex].length - count, count);
      if (moved.length === 0) return current;
      if (next[pageIndex + 1]) next[pageIndex + 1] = [...moved, ...next[pageIndex + 1]];
      else next.push(moved);

      let cursor = 0;
      const starts = next.map((entry) => {
        const at = cursor;
        cursor += entry.length;
        return at;
      });
      setPageStarts(starts);
      onPageCountRef.current(next.length);
      return next;
    });
  }, []);

  return { pages, pageStarts, ready, peelOverflowFromPage };
}
