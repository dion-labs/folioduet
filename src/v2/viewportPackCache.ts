import type { BookStreamBlock } from './bookStream';

const CACHE_PREFIX = 'pageecho-viewport-pack-v1:';

export type ViewportPackCacheEntry = {
  v: 1;
  fingerprint: string;
  packKey: string;
  pageStarts: number[];
};

/** Cheap content fingerprint — reject stale packs after re-extract / edit. */
export function streamFingerprint(stream: BookStreamBlock[]): string {
  if (stream.length === 0) return '0';
  let words = 0;
  for (const block of stream) words += block.words;
  const head = stream[0]?.key ?? '';
  const mid = stream[Math.floor(stream.length / 2)]?.key ?? '';
  const tail = stream[stream.length - 1]?.key ?? '';
  return `${stream.length}:${words}:${head}:${mid}:${tail}`;
}

export function pagesFromStarts(
  stream: BookStreamBlock[],
  pageStarts: number[],
): BookStreamBlock[][] {
  if (stream.length === 0) return [[]];
  if (pageStarts.length === 0) return [stream];
  return pageStarts.map((start, index) => {
    const end = pageStarts[index + 1] ?? stream.length;
    return stream.slice(Math.max(0, start), Math.max(start, end));
  });
}

export function loadViewportPackCache(
  documentId: string,
  fingerprint: string,
  packKey: string,
): ViewportPackCacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + documentId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewportPackCacheEntry;
    if (
      parsed?.v !== 1
      || parsed.fingerprint !== fingerprint
      || parsed.packKey !== packKey
      || !Array.isArray(parsed.pageStarts)
      || parsed.pageStarts.length === 0
    ) {
      return null;
    }
    const last = parsed.pageStarts[parsed.pageStarts.length - 1];
    if (typeof last !== 'number' || last < 0) return null;
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
