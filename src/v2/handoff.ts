import { tokenizeBlock } from '../hooks/TTSEngine';

export interface HandoffTarget {
  documentId: string;
  pageIndex: number;
  blockIndex: number;
  wordIndex: number;
  /**
   * Legacy block index; tall-paragraph fragments can differ across viewports.
   * Omitted on legacy links; resolve via pageStarts when applying.
   */
  streamIndex?: number;
  /** Absolute word offset, stable when tall paragraphs split differently by viewport. */
  globalWordIndex?: number;
}

const PARAM_DOC = 'd';
const PARAM_PAGE = 'p';
const PARAM_BLOCK = 'b';
const PARAM_WORD = 'w';
const PARAM_STREAM = 's';
const PARAM_GLOBAL_WORD = 'gw';
const PENDING_HANDOFF_KEY = 'pageecho-pending-handoff';

function parseIndex(value: string | null): number | undefined {
  if (value == null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function normalizedIndex(value: number): number {
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
    ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeTarget(target: HandoffTarget): HandoffTarget {
  const streamIndex = typeof target.streamIndex === 'number' && Number.isSafeInteger(target.streamIndex) && target.streamIndex >= 0
    ? Math.max(0, Math.floor(target.streamIndex))
    : undefined;
  const globalWordIndex = typeof target.globalWordIndex === 'number' && Number.isSafeInteger(target.globalWordIndex) && target.globalWordIndex >= 0
    ? target.globalWordIndex : undefined;
  return {
    documentId: target.documentId.trim(),
    pageIndex: normalizedIndex(target.pageIndex),
    blockIndex: normalizedIndex(target.blockIndex),
    wordIndex: normalizedIndex(target.wordIndex),
    ...(streamIndex !== undefined ? { streamIndex } : {}),
    ...(globalWordIndex !== undefined ? { globalWordIndex } : {}),
  };
}

export function buildHandoffUrl(
  origin: string,
  target: HandoffTarget,
): string {
  const normalized = normalizeTarget(target);
  const url = new URL(origin.endsWith('/') ? origin : `${origin}/`);
  url.searchParams.set(PARAM_DOC, normalized.documentId);
  url.searchParams.set(PARAM_PAGE, String(normalized.pageIndex));
  if (typeof normalized.streamIndex === 'number') {
    url.searchParams.set(PARAM_STREAM, String(normalized.streamIndex));
  }
  if (normalized.globalWordIndex !== undefined) {
    url.searchParams.set(PARAM_GLOBAL_WORD, String(normalized.globalWordIndex));
  }
  if (normalized.blockIndex > 0) url.searchParams.set(PARAM_BLOCK, String(normalized.blockIndex));
  if (normalized.wordIndex > 0) url.searchParams.set(PARAM_WORD, String(normalized.wordIndex));
  return url.toString();
}

export function parseHandoffFromSearch(search: string): HandoffTarget | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const documentId = params.get(PARAM_DOC)?.trim();
  if (!documentId) return null;
  const pageIndex = parseIndex(params.get(PARAM_PAGE)) ?? 0;
  const blockIndex = parseIndex(params.get(PARAM_BLOCK)) ?? 0;
  const wordIndex = parseIndex(params.get(PARAM_WORD)) ?? 0;
  const streamIndex = parseIndex(params.get(PARAM_STREAM));
  const globalWordIndex = parseIndex(params.get(PARAM_GLOBAL_WORD));
  return normalizeTarget({
    documentId,
    pageIndex,
    blockIndex,
    wordIndex,
    streamIndex,
    globalWordIndex,
  });
}

export function clearHandoffFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (
    !url.searchParams.has(PARAM_DOC)
    && !url.searchParams.has(PARAM_PAGE)
    && !url.searchParams.has(PARAM_BLOCK)
    && !url.searchParams.has(PARAM_WORD)
    && !url.searchParams.has(PARAM_STREAM)
    && !url.searchParams.has(PARAM_GLOBAL_WORD)
  ) {
    return;
  }
  url.searchParams.delete(PARAM_DOC);
  url.searchParams.delete(PARAM_PAGE);
  url.searchParams.delete(PARAM_BLOCK);
  url.searchParams.delete(PARAM_WORD);
  url.searchParams.delete(PARAM_STREAM);
  url.searchParams.delete(PARAM_GLOBAL_WORD);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

export function readHandoffFromLocation(): HandoffTarget | null {
  if (typeof window === 'undefined') return null;
  return parseHandoffFromSearch(window.location.search);
}

function getLocalStorage(): Storage | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

export function loadPendingHandoff(): HandoffTarget | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PENDING_HANDOFF_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      storage.removeItem(PENDING_HANDOFF_KEY);
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.documentId !== 'string' || !record.documentId.trim()) {
      storage.removeItem(PENDING_HANDOFF_KEY);
      return null;
    }
    const pageIndex = typeof record.pageIndex === 'number' && Number.isFinite(record.pageIndex)
      ? record.pageIndex
      : 0;
    const blockIndex = typeof record.blockIndex === 'number' && Number.isFinite(record.blockIndex)
      ? record.blockIndex
      : 0;
    const wordIndex = typeof record.wordIndex === 'number' && Number.isFinite(record.wordIndex)
      ? record.wordIndex
      : 0;
    const streamIndex = typeof record.streamIndex === 'number' && Number.isFinite(record.streamIndex)
      ? record.streamIndex
      : undefined;
    return normalizeTarget({
      documentId: record.documentId,
      pageIndex,
      blockIndex,
      wordIndex,
      streamIndex,
      globalWordIndex: typeof record.globalWordIndex === 'number' ? record.globalWordIndex : undefined,
    });
  } catch {
    return null;
  }
}

export function savePendingHandoff(target: HandoffTarget): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(PENDING_HANDOFF_KEY, JSON.stringify(normalizeTarget(target)));
  } catch {
    // ignore quota / private mode
  }
}

export function clearPendingHandoff(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(PENDING_HANDOFF_KEY);
  } catch {
    // ignore
  }
}

/** Resolve a stream index for restore, using pageStarts when `s` was missing. */
export function resolveHandoffStreamIndex(
  target: HandoffTarget,
  pageStarts: number[],
): number {
  if (typeof target.streamIndex === 'number' && target.streamIndex >= 0) {
    return target.streamIndex;
  }
  const pageStart = pageStarts[target.pageIndex] ?? 0;
  return Math.max(0, pageStart + target.blockIndex);
}

/** Viewport fragments preserve the ordered word count even when their indexes change. */
type WordPages = ReadonlyArray<ReadonlyArray<{ text: string }>>;

export function getHandoffGlobalWordIndex(pages: WordPages, streamIndex: number, wordIndex: number): number | undefined {
  if (!Number.isSafeInteger(streamIndex) || streamIndex < 0) return undefined;
  let index = 0;
  let offset = 0;
  for (const page of pages) {
    for (const block of page) {
      const words = tokenizeBlock(block.text).length;
      if (index === streamIndex) {
        if (words === 0) return undefined;
        const word = Math.min(words - 1, normalizedIndex(wordIndex));
        return Number.isSafeInteger(offset + word) ? offset + word : undefined;
      }
      offset += words;
      index += 1;
    }
  }
  return undefined;
}

export function resolveHandoffGlobalWordIndex(pages: WordPages, globalWordIndex: number) {
  if (!Number.isSafeInteger(globalWordIndex) || globalWordIndex < 0) return null;
  let remaining = globalWordIndex;
  let streamIndex = 0;
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    for (let blockIndex = 0; blockIndex < pages[pageIndex].length; blockIndex += 1) {
      const block = pages[pageIndex][blockIndex];
      const words = tokenizeBlock(block.text).length;
      if (remaining < words) return { pageIndex, blockIndex, wordIndex: remaining, streamIndex };
      remaining -= words;
      streamIndex += 1;
    }
  }
  // Changed/truncated content: retain the existing legacy fallback.
  return null;
}
