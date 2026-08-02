import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import {
  expandStreamForBudgetAsync,
  packStreamByHeight,
  packStreamByWords,
  resolvePackRestore,
  type BookStreamBlock,
  type PackPageAnchor,
} from './bookStream';
import { DEFAULT_WORDS_PER_PAGE } from './documents';
import {
  createBookStreamMeasurer,
  measurePageBodyBudget,
  measurePageBodyContentWidth,
} from './measureBookStream';
import {
  loadViewportPackCache,
  pagesFromStarts,
  saveViewportPackCache,
  streamFingerprint,
} from './viewportPackCache';
import { yieldToMain } from './yieldToMain';

type Anchor = {
  streamIndex: number;
  wordIndex: number;
};

type Options = {
  stream: BookStreamBlock[] | null;
  enabled: boolean;
  fontScale: number;
  /** Per-device pack cache key (document id). */
  cacheDocumentId?: string | null;
  stageRef: RefObject<HTMLElement | null>;
  pageBodyRef: RefObject<HTMLElement | null>;
  /** Content anchor preserved across viewport / font reflows. */
  anchorRef: MutableRefObject<Anchor>;
  /**
   * One-shot legacy restore by saved viewport page (consumed on first pack).
   * Prefer stream `anchorRef` when `activeStreamIndex` is known.
   */
  pageAnchorRef?: MutableRefObject<PackPageAnchor | null>;
  onPageCount: (totalPages: number) => void;
  onRestorePage: (pageIndex: number, localBlockIndex: number, wordIndex: number) => void;
};

function quantize(value: number, step = 8): number {
  return Math.round(value / step) * step;
}

function resolveBudget(
  stage: HTMLElement | null,
  body: HTMLElement | null,
  fontScale: number,
): { width: number; budget: number } {
  const width = measurePageBodyContentWidth(body)
    || body?.clientWidth
    || stage?.clientWidth
    || Math.min(780, typeof window !== 'undefined' ? window.innerWidth - 48 : 680);
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

  return { width, budget };
}

export function useViewportBookPages({
  stream,
  enabled,
  fontScale,
  cacheDocumentId,
  stageRef,
  pageBodyRef,
  anchorRef,
  pageAnchorRef,
  onPageCount,
  onRestorePage,
}: Options) {
  const [pages, setPages] = useState<BookStreamBlock[][]>([]);
  const [pageStarts, setPageStarts] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  /** True while the precise height pack is still measuring / packing. */
  const [packing, setPacking] = useState(false);
  const packTimerRef = useRef<number | null>(null);
  const lastPackKeyRef = useRef('');
  const packGenRef = useRef(0);
  const cancelSignalRef = useRef({ cancelled: false });

  // Keep latest callbacks without re-subscribing the pack effect (page-count
  // updates used to recreate these and re-enter an expensive pack loop).
  const onPageCountRef = useRef(onPageCount);
  const onRestorePageRef = useRef(onRestorePage);
  onPageCountRef.current = onPageCount;
  onRestorePageRef.current = onRestorePage;

  const applyPack = useCallback((
    nextPages: BookStreamBlock[][],
    nextStarts: number[],
    markReady: boolean,
  ) => {
    let pagesOut = nextPages;
    let startsOut = nextStarts;
    if (pagesOut.length === 0) {
      pagesOut = [[]];
      startsOut = [0];
    }
    setPages(pagesOut);
    setPageStarts(startsOut);
    if (markReady) setReady(true);
    onPageCountRef.current(pagesOut.length);

    const pageAnchor = pageAnchorRef?.current ?? null;
    const restored = resolvePackRestore(
      startsOut,
      pagesOut.map((page) => page.length),
      anchorRef.current,
      pageAnchor,
    );
    // Keep the page anchor + stream untouched until a pack actually contains
    // that page — otherwise a 1-page stub / short word-pack poisons resume.
    if (restored.deferredPageAnchor) {
      return;
    }
    if (restored.consumedPageAnchor && pageAnchorRef) {
      pageAnchorRef.current = null;
    }
    anchorRef.current = {
      streamIndex: restored.streamIndex,
      wordIndex: restored.wordIndex,
    };
    onRestorePageRef.current(
      restored.pageIndex,
      restored.localBlockIndex,
      restored.wordIndex,
    );
  }, [anchorRef, pageAnchorRef]);

  useEffect(() => {
    cancelSignalRef.current.cancelled = true;
    cancelSignalRef.current = { cancelled: false };
    const signal = cancelSignalRef.current;
    const gen = ++packGenRef.current;

    if (!enabled || !stream) {
      lastPackKeyRef.current = '';
      setPages([]);
      setPageStarts([]);
      setReady(false);
      setPacking(false);
      return undefined;
    }

    if (stream.length === 0) {
      lastPackKeyRef.current = '';
      setPages([]);
      setPageStarts([]);
      setReady(true);
      setPacking(false);
      onPageCountRef.current(1);
      return undefined;
    }

    lastPackKeyRef.current = '';

    const runPack = () => {
      if (gen !== packGenRef.current || signal.cancelled) return;

      const stage = stageRef.current;
      const body = pageBodyRef.current;
      const { width, budget } = resolveBudget(stage, body, fontScale);
      const packKey = `${stream.length}:${quantize(width)}:${quantize(budget)}:${fontScale.toFixed(2)}`;
      if (packKey === lastPackKeyRef.current) return;
      lastPackKeyRef.current = packKey;

      const fingerprint = streamFingerprint(stream);

      // 1) Instant provisional layout so the current page can paint.
      const provisional = packStreamByWords(stream, DEFAULT_WORDS_PER_PAGE);
      applyPack(provisional.pages, provisional.pageStarts, true);

      // 2) Validated per-device cache of a prior precise pack.
      if (cacheDocumentId) {
        const cached = loadViewportPackCache(cacheDocumentId, fingerprint, packKey);
        if (cached) {
          const cachedPages = pagesFromStarts(stream, cached.pageStarts);
          if (cachedPages.length === cached.pageStarts.length) {
            applyPack(cachedPages, cached.pageStarts, true);
            setPacking(false);
            return;
          }
        }
      }

      if (budget < 120) {
        // Word pack is already the best we can do without a real viewport.
        setPacking(false);
        return;
      }

      setPacking(true);

      // 3) Precise height pack in the background — yield often; skip sync page-peel
      //    (live useLayoutEffect peel handles the visible page only).
      void (async () => {
        const measurer = createBookStreamMeasurer({ width, fontScale });
        try {
          await yieldToMain();
          if (gen !== packGenRef.current || signal.cancelled) return;

          const heights = await measurer.measureHeightsAsync(stream, {
            chunkSize: 6,
            signal,
          });
          if (gen !== packGenRef.current || signal.cancelled) return;
          await yieldToMain();

          const packable = await expandStreamForBudgetAsync(
            stream,
            budget,
            measurer.measureBlock,
            heights,
            { chunkSize: 6, signal, yieldFn: yieldToMain },
          );
          if (gen !== packGenRef.current || signal.cancelled) return;
          await yieldToMain();

          const packHeights = packable.length === stream.length
            ? heights
            : await measurer.measureHeightsAsync(packable, { chunkSize: 6, signal });
          if (gen !== packGenRef.current || signal.cancelled) return;
          await yieldToMain();

          // Height-only pack: no measurePage peel (that was freezing the UI).
          const precise = packStreamByHeight(packable, packHeights, budget);

          if (gen !== packGenRef.current || signal.cancelled) return;

          // Low-priority commit so in-flight page turns aren't blocked.
          startTransition(() => {
            if (gen !== packGenRef.current || signal.cancelled) return;
            applyPack(precise.pages, precise.pageStarts, true);
          });

          if (cacheDocumentId) {
            saveViewportPackCache(
              cacheDocumentId,
              fingerprint,
              packKey,
              precise.pageStarts,
            );
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          // Keep provisional word pack on unexpected measure failures.
        } finally {
          measurer.dispose();
          if (gen === packGenRef.current) setPacking(false);
        }
      })();
    };

    const schedule = () => {
      if (packTimerRef.current !== null) window.clearTimeout(packTimerRef.current);
      packTimerRef.current = window.setTimeout(runPack, 60);
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
      signal.cancelled = true;
      if (packTimerRef.current !== null) window.clearTimeout(packTimerRef.current);
      observer?.disconnect();
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [
    enabled,
    stream,
    fontScale,
    cacheDocumentId,
    stageRef,
    pageBodyRef,
    anchorRef,
    applyPack,
  ]);

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

  return { pages, pageStarts, ready, packing, peelOverflowFromPage };
}
