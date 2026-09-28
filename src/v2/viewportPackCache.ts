import type { BookStreamBlock } from './bookStream';

const CACHE_PREFIX = 'pageecho-viewport-pack-v1:';

export type ViewportPackCacheEntry = {
  v: 1;
  fingerprint: string;
  packKey: string;
  pageStarts: number[];
};

/** Fingerprint every layout input so same-length re-extraction invalidates a pack. */
export function streamFingerprint(stream: BookStreamBlock[]): string {
  let hash = 2166136261;
  for (const block of stream) {
    const input = JSON.stringify(block);
    for (let i = 0; i < input.length; i += 1) {
      hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
    }
  }
  return `${stream.length}:content-v2:${hash >>> 0}`;
}

function validPageStarts(value: unknown, streamLength?: number): value is number[] {
  return Array.isArray(value)
    && value.length > 0
    && value[0] === 0
    && value.every((start, index) => Number.isSafeInteger(start)
      && start >= 0
      && (index === 0 || start > value[index - 1])
      && (streamLength === undefined || start < Math.max(1, streamLength)));
}

export function pagesFromStarts(
  stream: BookStreamBlock[],
  pageStarts: number[],
): BookStreamBlock[][] {
  if (stream.length === 0) return [[]];
  if (!validPageStarts(pageStarts, stream.length)) return [stream];
  return pageStarts.map((start, index) => {
    const end = pageStarts[index + 1] ?? stream.length;
    return stream.slice(Math.max(0, start), Math.max(start, end));
  });
}

export function loadViewportPackCache(
  documentId: string,
  fingerprint: string,
  packKey: string,
  streamLength?: number,
): ViewportPackCacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + documentId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewportPackCacheEntry;
    if (
      parsed?.v !== 1
      || parsed.fingerprint !== fingerprint
      || parsed.packKey !== packKey
      || !validPageStarts(parsed.pageStarts, streamLength)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveViewportPackCache(
  documentId: string,
  fingerprint: string,
  packKey: string,
  pageStarts: number[],
): void {
  try {
    const entry: ViewportPackCacheEntry = {
      v: 1,
      fingerprint,
      packKey,
      pageStarts,
    };
    localStorage.setItem(CACHE_PREFIX + documentId, JSON.stringify(entry));
  } catch {
    // quota / private mode — ignore
  }
}

export function clearViewportPackCache(documentId: string): void {
  try {
    localStorage.removeItem(CACHE_PREFIX + documentId);
  } catch {
    // private mode / disabled storage — nothing else to clear
  }
}
