export interface HandoffTarget {
  documentId: string;
  pageIndex: number;
  blockIndex: number;
  wordIndex: number;
  /**
   * Global block index in the book stream — stable across device viewport packing.
   * Omitted on legacy links; resolve via pageStarts when applying.
   */
  streamIndex?: number;
}

const PARAM_DOC = 'd';
const PARAM_PAGE = 'p';
const PARAM_BLOCK = 'b';
const PARAM_WORD = 'w';
const PARAM_STREAM = 's';
const PENDING_HANDOFF_KEY = 'pageecho-pending-handoff';

function nonNegativeInt(value: string | null, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeTarget(target: HandoffTarget): HandoffTarget {
  const streamIndex = typeof target.streamIndex === 'number' && Number.isFinite(target.streamIndex)
    ? Math.max(0, Math.floor(target.streamIndex))
    : undefined;
  return {
    documentId: target.documentId.trim(),
    pageIndex: Math.max(0, Math.floor(target.pageIndex)),
    blockIndex: Math.max(0, Math.floor(target.blockIndex)),
    wordIndex: Math.max(0, Math.floor(target.wordIndex)),
    ...(streamIndex !== undefined ? { streamIndex } : {}),
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
  if (normalized.blockIndex > 0) url.searchParams.set(PARAM_BLOCK, String(normalized.blockIndex));
  if (normalized.wordIndex > 0) url.searchParams.set(PARAM_WORD, String(normalized.wordIndex));
  return url.toString();
}

export function parseHandoffFromSearch(search: string): HandoffTarget | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const documentId = params.get(PARAM_DOC)?.trim();
  if (!documentId) return null;
  const pageIndex = nonNegativeInt(params.get(PARAM_PAGE));
  const blockIndex = nonNegativeInt(params.get(PARAM_BLOCK));
  const wordIndex = nonNegativeInt(params.get(PARAM_WORD));
  const streamIndex = params.has(PARAM_STREAM)
    ? nonNegativeInt(params.get(PARAM_STREAM))
    : undefined;
  return normalizeTarget({
    documentId,
    pageIndex,
    blockIndex,
    wordIndex,
    streamIndex,
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
  ) {
    return;
  }
  url.searchParams.delete(PARAM_DOC);
  url.searchParams.delete(PARAM_PAGE);
  url.searchParams.delete(PARAM_BLOCK);
  url.searchParams.delete(PARAM_WORD);
  url.searchParams.delete(PARAM_STREAM);
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
