import { describe, expect, it } from 'vitest';
import type { BookStreamBlock } from './bookStream';
import {
  buildChapterIndex,
  findCurrentChapterIndex,
  locateChaptersOnPages,
} from './chapters';

function block(
  text: string,
  options: { chapterBreak?: boolean; words?: number; type?: BookStreamBlock['type'] } = {},
): BookStreamBlock {
  const chapterBreak = options.chapterBreak ?? false;
  return {
    markdown: chapterBreak ? `### ${text}` : text,
    text,
    type: options.type ?? (chapterBreak ? 'h3' : 'p'),
    chapterBreak,
    key: text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(),
    words: options.words ?? text.split(/\s+/).filter(Boolean).length,
  };
}

describe('buildChapterIndex', () => {
  it('keeps major headings and drops short/noisy ones', () => {
    const body = 'word '.repeat(120).trim();
    const stream = [
      block('Preface to the First Edition', { chapterBreak: true }),
      block(body, { words: 120 }),
      block('Tiny', { chapterBreak: true }),
      block('only a little body here', { words: 5 }),
      block('The Tar Pit', { chapterBreak: true }),
      block(body, { words: 120 }),
      block('Index', { chapterBreak: true }),
      block(body, { words: 120 }),
      block('Padegs, A., 62', { chapterBreak: true }),
      block(body, { words: 120 }),
    ];

    const chapters = buildChapterIndex(stream);
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      'Preface to the First Edition',
      'The Tar Pit',
    ]);
  });

  it('keeps anniversary-style ordinals in titles', () => {
    const body = 'word '.repeat(120).trim();
    const stream = [
      block('Preface to the 20th Anniversary Edition', { chapterBreak: true }),
      block(body, { words: 120 }),
    ];
    expect(buildChapterIndex(stream).map((chapter) => chapter.title)).toEqual([
      'Preface to the 20th Anniversary Edition',
    ]);
  });

  it('deduplicates repeated chapter titles by first occurrence', () => {
    const body = 'word '.repeat(110).trim();
    const stream = [
      block('The Tar Pit', { chapterBreak: true }),
      block(body, { words: 110 }),
      block('The Tar Pit', { chapterBreak: true }),
      block(body, { words: 110 }),
    ];
    expect(buildChapterIndex(stream)).toHaveLength(1);
  });
});

describe('locateChaptersOnPages / findCurrentChapterIndex', () => {
  it('maps chapters onto packed pages and tracks the active one', () => {
    const chapters = buildChapterIndex([
      block('One', { chapterBreak: true }),
      block('aaa '.repeat(110).trim(), { words: 110 }),
      block('Two', { chapterBreak: true }),
      block('bbb '.repeat(110).trim(), { words: 110 }),
    ]);
    const pages = [
      [block('One', { chapterBreak: true }), block('aaa')],
      [block('more')],
      [block('Two', { chapterBreak: true }), block('bbb')],
    ];
    const located = locateChaptersOnPages(chapters, pages);
    expect(located.map((chapter) => chapter.pageIndex)).toEqual([0, 2]);
    expect(findCurrentChapterIndex(located, 0)).toBe(0);
    expect(findCurrentChapterIndex(located, 1)).toBe(0);
    expect(findCurrentChapterIndex(located, 2)).toBe(1);
  });
});
