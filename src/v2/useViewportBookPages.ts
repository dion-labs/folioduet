import {
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
  clearViewportPackCache,
  loadViewportPackCache,
  pagesFromStarts,
  saveViewportPackCache,
  streamFingerprint,
} from './viewportPackCache';
import { yieldToMain } from './yieldToMain';
import { debugLog } from './debug';

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
  onRestorePage: (pageIndex: number, localBlockIndex: number, wordIndex: number, finalized?: boolean) => void;
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
  const [finalizedPack, setFinalizedPack] = useState<{
    stream: BookStreamBlock[]; documentId: string | null | undefined;
  } | null>(null);
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
    finalized = false,
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
    const streamBefore = { ...anchorRef.current };
    const restored = resolvePackRestore(
      startsOut,
      pagesOut.map((page) => page.length),
      anchorRef.current,
      pageAnchor,
      finalized,
    );
    // Keep the page anchor + stream untouched until a pack actually contains
    // that page — otherwise a 1-page stub / short word-pack poisons resume.
    if (restored.deferredPageAnchor) {
      debugLog('pack', 'defer page-anchor restore (pack too short)', {
        pageCount: startsOut.length,
        pageAnchor,
        streamBefore,
        packKeyHint: `${startsOut.length}pages/${pagesOut.reduce((n, p) => n + p.length, 0)}blocks`,
      });
      return;
    }
    if (restored.consumedPageAnchor && pageAnchorRef) {
      pageAnchorRef.current = null;
    }
    anchorRef.current = {
      streamIndex: restored.streamIndex,
      wordIndex: restored.wordIndex,
    };
    debugLog('pack', 'applyPack restore', {
      pageCount: startsOut.length,
      pageStartsHead: startsOut.slice(0, 8),
      pageAnchor,
      streamBefore,
      restored,
      consumedPageAnchor: restored.consumedPageAnchor,
    });
    onRestorePageRef.current(
      restored.pageIndex,
      restored.localBlockIndex,
      restored.wordIndex,
      finalized,
    );
  }, [anchorRef, pageAnchorRef]);

  useEffect(() => {
    cancelSignalRef.current.cancelled = true;
    cancelSignalRef.current = { cancelled: false };
    const signal = cancelSignalRef.current;
    const gen = ++packGenRef.current;
    setFinalizedPack(null);

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
    // A resize can schedule another pack while the prior async measurement is
    // still yielding. Only the newest run may commit, and only the first run
    // should publish the quick word-based placeholder.
    let latestRun = 0;
    let hasPublishedPack = false;
    const fingerprint = streamFingerprint(stream);

    const runPack = () => {
      if (gen !== packGenRef.current || signal.cancelled) return;

      const stage = stageRef.current;
      const body = pageBodyRef.current;
      const { width, budget } = resolveBudget(stage, body, fontScale);
      const packKey = `${stream.length}:${quantize(width)}:${quantize(budget)}:${fontScale.toFixed(2)}`;
      if (packKey === lastPackKeyRef.current) return;
      lastPackKeyRef.current = packKey;
      const run = ++latestRun;
      setFinalizedPack(null);
      const isStale = () => (
        gen !== packGenRef.current
        || signal.cancelled
        || run !== latestRun
      );

      // 1) Instant provisional layout so the current page can paint.
      // Keep the current measured layout during later resize repacks; repeatedly
      // replacing it with the provisional count caused the visible 7 ↔ 8 loop.
      if (!hasPublishedPack) {
        const provisional = packStreamByWords(stream, DEFAULT_WORDS_PER_PAGE);
        applyPack(provisional.pages, provisional.pageStarts, true);
        hasPublishedPack = true;
      }

      // 2) Validated per-device cache of a prior precise pack.
      if (cacheDocumentId) {
        const cached = loadViewportPackCache(cacheDocumentId, fingerprint, packKey, stream.length);
        if (cached) {
          const cachedPages = pagesFromStarts(stream, cached.pageStarts);
          if (cachedPages.length === cached.pageStarts.length) {
            if (isStale()) return;
            applyPack(cachedPages, cached.pageStarts, true, true);
            setFinalizedPack({ stream, documentId: cacheDocumentId });
            hasPublishedPack = true;
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
          if (isStale()) return;

          const heights = await measurer.measureHeightsAsync(stream, {
            chunkSize: 6,
            signal,
          });
          if (isStale()) return;
          await yieldToMain();

          const packable = await expandStreamForBudgetAsync(
            stream,
            budget,
            measurer.measureBlock,
            heights,
            { chunkSize: 6, signal, yieldFn: yieldToMain },
          );
          if (isStale()) return;
          await yieldToMain();

          const packHeights = packable.length === stream.length
            ? heights
            : await measurer.measureHeightsAsync(packable, { chunkSize: 6, signal });
          if (isStale()) return;
          await yieldToMain();

          // Height-only pack: no measurePage peel (that was freezing the UI).
          const precise = packStreamByHeight(packable, packHeights, budget);

          if (isStale()) return;

          // Measurements already yield between chunks. Publish the completed
          // pack with its ready state in one priority lane; a delayed transition
          // can otherwise be overwritten by a peel of the provisional layout.
          hasPublishedPack = true;
          applyPack(precise.pages, precise.pageStarts, true, true);
          setFinalizedPack({ stream, documentId: cacheDocumentId });

          if (cacheDocumentId && !isStale()) {
            // Cache boundaries index the original stream, not viewport-specific
            // fragments of tall paragraphs. Reconstructing split boundaries
            // against unsplit blocks can hide most of a paragraph after reload.
            if (packable.length === stream.length && packable.every((block, index) => block === stream[index])) {
              saveViewportPackCache(cacheDocumentId, fingerprint, packKey, precise.pageStarts);
            } else {
              clearViewportPackCache(cacheDocumentId);
            }
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          debugLog('pack', 'measurement failed; retaining provisional layout', {
            message: error instanceof Error ? error.message : String(error),
          });
          // Keep provisional word pack on unexpected measure failures.
        } finally {
          measurer.dispose();
          if (!isStale()) setPacking(false);
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
    if (pageIndex < 0 || pageIndex >= pages.length) return;
    const page = pages[pageIndex];
    const count = Math.min(Math.max(1, removeCount), Math.max(0, page.length - 1));
    if (count <= 0) return;

    const next = pages.map((entry) => [...entry]);
    const moved = next[pageIndex].splice(next[pageIndex].length - count, count);
    if (moved.length === 0) return;
    if (next[pageIndex + 1]) next[pageIndex + 1] = [...moved, ...next[pageIndex + 1]];
    else next.push(moved);

    let cursor = 0;
    const starts = next.map((entry) => {
      const at = cursor;
      cursor += entry.length;
      return at;
    });
    // Do not call other setters from inside a setPages updater: React can
    // replay that updater while rebasing a transition, causing a render loop.
    setPages(next);
    setPageStarts(starts);
    onPageCountRef.current(next.length);
  }, [pages]);

  const finalized = finalizedPack !== null
    && finalizedPack.stream === stream
    && finalizedPack.documentId === cacheDocumentId;
  return { pages, pageStarts, ready, finalized, packing, peelOverflowFromPage };
}
