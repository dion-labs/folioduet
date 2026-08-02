export interface HandoffTarget {
  documentId: string;
  pageIndex: number;
  blockIndex: number;
  wordIndex: number;
}

const PARAM_DOC = 'd';
const PARAM_PAGE = 'p';
const PARAM_BLOCK = 'b';
const PARAM_WORD = 'w';
const PENDING_HANDOFF_KEY = 'pageecho-pending-handoff';

function nonNegativeInt(value: string | null, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isHandoffTarget(value: unknown): value is HandoffTarget {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.documentId === 'string'
    && record.documentId.trim().length > 0
    && typeof record.pageIndex === 'number'
    && Number.isFinite(record.pageIndex)
    && typeof record.blockIndex === 'number'
    && Number.isFinite(record.blockIndex)
    && typeof record.wordIndex === 'number'
    && Number.isFinite(record.wordIndex);
}

export function buildHandoffUrl(
  origin: string,
  target: HandoffTarget,
): string {
  const url = new URL(origin.endsWith('/') ? origin : `${origin}/`);
  url.searchParams.set(PARAM_DOC, target.documentId);
  url.searchParams.set(PARAM_PAGE, String(target.pageIndex));
  if (target.blockIndex > 0) url.searchParams.set(PARAM_BLOCK, String(target.blockIndex));
  if (target.wordIndex > 0) url.searchParams.set(PARAM_WORD, String(target.wordIndex));
  return url.toString();
}

export function parseHandoffFromSearch(search: string): HandoffTarget | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const documentId = params.get(PARAM_DOC)?.trim();
  if (!documentId) return null;
  return {
    documentId,
    pageIndex: nonNegativeInt(params.get(PARAM_PAGE)),
    blockIndex: nonNegativeInt(params.get(PARAM_BLOCK)),
    wordIndex: nonNegativeInt(params.get(PARAM_WORD)),
  };
}

export function clearHandoffFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (
    !url.searchParams.has(PARAM_DOC)
    && !url.searchParams.has(PARAM_PAGE)
    && !url.searchParams.has(PARAM_BLOCK)
    && !url.searchParams.has(PARAM_WORD)
  ) {
    return;
  }
  url.searchParams.delete(PARAM_DOC);
  url.searchParams.delete(PARAM_PAGE);
  url.searchParams.delete(PARAM_BLOCK);
  url.searchParams.delete(PARAM_WORD);
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
    if (!isHandoffTarget(parsed)) {
      storage.removeItem(PENDING_HANDOFF_KEY);
      return null;
    }
    return {
      documentId: parsed.documentId,
      pageIndex: Math.max(0, Math.floor(parsed.pageIndex)),
      blockIndex: Math.max(0, Math.floor(parsed.blockIndex)),
      wordIndex: Math.max(0, Math.floor(parsed.wordIndex)),
    };
  } catch {
    return null;
  }
}

export function savePendingHandoff(target: HandoffTarget): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(PENDING_HANDOFF_KEY, JSON.stringify({
      documentId: target.documentId,
      pageIndex: Math.max(0, Math.floor(target.pageIndex)),
      blockIndex: Math.max(0, Math.floor(target.blockIndex)),
      wordIndex: Math.max(0, Math.floor(target.wordIndex)),
    }));
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
