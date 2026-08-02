import type { BookStreamBlock } from './bookStream';

export type BookChapter = {
  key: string;
  title: string;
  streamIndex: number;
  level: number;
};

export type LocatedChapter = BookChapter & {
  pageIndex: number;
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function cleanTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Drop conversion noise that looks like a heading but isn't a real TOC entry. */
export function isChapterTocCandidate(block: BookStreamBlock): boolean {
  if (!block.chapterBreak) return false;
  const title = cleanTitle(block.text);
  const words = countWords(title);
  if (words < 1 || words > 10) return false;
  if (/,\s*$/.test(title)) return false;
  if (/,\s*\d{1,4}\s*$/.test(title)) return false;
  if (/^index$/i.test(title)) return false;
  if (/^notes and references\b/i.test(title)) return false;
  if (/^chapter\s+\d+\.?$/i.test(title)) return false;
  if (/^\d+\b/.test(title)) return false;
  if (/^[a-z]/.test(title)) return false;
  if (/fig\.\s*\d/i.test(title)) return false;
  if (/abstract\d|bettman archive|vanilla framework|perennial library/i.test(title)) return false;
  // CamelCase smash from PDF extraction ("Plan toThrow").
  if (/[a-z][A-Z]/.test(title)) return false;
  // Page furniture jammed into titles ("…Documents? 111 When"),
  // but keep ordinals ("20th Anniversary") and "Chapter 12. …".
  const withoutOrdinals = title.replace(/\b\d+(st|nd|rd|th)\b/gi, '');
  if (
    /\b\d{2,4}\b/.test(withoutOrdinals)
    && !/^chapter\s+\d+/i.test(title)
  ) {
    return false;
  }
  return true;
}

function followingBodyWords(stream: BookStreamBlock[], headingIndex: number): number {
  let words = 0;
  for (let index = headingIndex + 1; index < stream.length; index += 1) {
    if (stream[index].chapterBreak) break;
    words += stream[index].words;
  }
  return words;
}

/**
 * Build a navigable chapter list from the speakable stream.
 * Uses heading breaks already marked during import, then filters duplicates/noise
 * and keeps entries that introduce a meaningful stretch of body text.
 */
export function buildChapterIndex(
  stream: BookStreamBlock[],
  options: { minFollowingWords?: number } = {},
): BookChapter[] {
  const minFollowingWords = options.minFollowingWords ?? 100;
  const chapters: BookChapter[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < stream.length; index += 1) {
    const block = stream[index];
    if (!isChapterTocCandidate(block)) continue;
    if (seen.has(block.key)) continue;

    const bodyWords = followingBodyWords(stream, index);
    const title = cleanTitle(block.text);
    const keep =
      bodyWords >= minFollowingWords
      || /^preface\b/i.test(title)
      || /^prologue\b/i.test(title)
      || /^epilogue\b/i.test(title)
      || /^chapter\s+\d+/i.test(title);
    if (!keep) continue;

    seen.add(block.key);
    chapters.push({
      key: block.key,
      title,
      streamIndex: index,
      level: Number(block.type.replace(/\D/g, '')) || 3,
    });
  }

  return chapters;
}

export function findPageForChapterKey(
  pages: BookStreamBlock[][],
  chapterKey: string,
): number {
  for (let page = 0; page < pages.length; page += 1) {
    if (pages[page].some((block) => block.chapterBreak && block.key === chapterKey)) {
      return page;
    }
  }
  for (let page = 0; page < pages.length; page += 1) {
    if (pages[page].some((block) => block.key === chapterKey)) {
      return page;
    }
  }
  return -1;
}

/** Attach reading-page indexes after viewport packing (handles split blocks). */
export function locateChaptersOnPages(
  chapters: BookChapter[],
  pages: BookStreamBlock[][],
): LocatedChapter[] {
  return chapters
    .map((chapter) => ({
      ...chapter,
      pageIndex: findPageForChapterKey(pages, chapter.key),
    }))
    .filter((chapter) => chapter.pageIndex >= 0)
    .sort((left, right) => left.pageIndex - right.pageIndex || left.streamIndex - right.streamIndex);
}

/** Last chapter whose start page is at or before the current reading page. */
export function findCurrentChapterIndex(
  chapters: Array<{ pageIndex: number }>,
  pageIndex: number,
): number {
  let current = -1;
  for (let index = 0; index < chapters.length; index += 1) {
    if (chapters[index].pageIndex <= pageIndex) current = index;
    else break;
  }
  return current;
}
