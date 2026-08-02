import { describe, expect, it } from 'vitest';
import {
  expandStreamForBudget,
  findPageForStreamIndex,
  packStreamByHeight,
  type BookStreamBlock,
} from './bookStream';

function block(text: string, chapterBreak = false): BookStreamBlock {
  return {
    markdown: chapterBreak ? `### ${text}` : text,
    text,
    type: chapterBreak ? 'h3' : 'p',
    chapterBreak,
    key: text.toLowerCase().slice(0, 40),
    words: text.split(/\s+/).length,
  };
}

describe('packStreamByHeight', () => {
  it('fills pages to the viewport budget and breaks early on chapters', () => {
    const stream = [
      block('Chapter One', true),
      block('alpha alpha alpha'),
      block('beta beta beta'),
      block('Chapter Two', true),
      block('gamma gamma gamma'),
    ];
    const heights = [40, 80, 80, 40, 80];
    const { pages, pageStarts } = packStreamByHeight(stream, heights, 220);

    expect(pages[0].map((item) => item.text)).toEqual([
      'Chapter One',
      'alpha alpha alpha',
      'beta beta beta',
    ]);
    expect(pages[1].map((item) => item.text)).toEqual([
      'Chapter Two',
      'gamma gamma gamma',
    ]);
    expect(pageStarts).toEqual([0, 3]);
  });

  it('starts a new page when the next block would overflow', () => {
    const stream = [block('one'), block('two'), block('three')];
    const heights = [100, 100, 100];
    const { pages } = packStreamByHeight(stream, heights, 150);
    expect(pages).toHaveLength(3);
  });

  it('peels trailing blocks when stacked measure exceeds the budget', () => {
    const stream = [block('one'), block('two'), block('three')];
    const heights = [50, 50, 50];
    const { pages } = packStreamByHeight(stream, heights, 200, {
      // Pretend stacking is taller than the sum — forces a peel.
      measurePage: (page) => page.length * 90,
    });
    expect(pages.every((page) => page.length <= 2)).toBe(true);
    expect(pages.flat().map((item) => item.text)).toEqual(['one', 'two', 'three']);
  });
});

describe('expandStreamForBudget', () => {
  it('splits an oversized paragraph so packed pages keep every word', () => {
    const long = [
      'Chapter 19 is the updating essay itself.',
      'The reader should be warned that the new opinions are not nearly so well informed by experience as those in the original book.',
      'In preparing this retrospective, I have sought the current views of friends.',
    ].join(' ');
    const stream = [block(long), block('Preface to the First Edition', true)];
    // Fake measure: ~8px per word, budget fits ~12 words.
    const measure = (item: BookStreamBlock) => Math.max(1, item.words * 8);
    const expanded = expandStreamForBudget(stream, 100, measure);
    expect(expanded.length).toBeGreaterThan(2);
    expect(expanded.every((item) => measure(item) <= 100 || item.chapterBreak)).toBe(true);
    expect(expanded.map((item) => item.text).join(' ')).toContain('The reader should be warned');
    expect(expanded.map((item) => item.text).join(' ')).toContain('In preparing this retrospective');

    const heights = expanded.map(measure);
    const { pages } = packStreamByHeight(expanded, heights, 100);
    expect(pages.flat().map((item) => item.text).join(' ')).toContain('warned that the new opinions');
    expect(pages.flat().some((item) => /Preface to the First Edition/.test(item.text))).toBe(true);
  });
});

describe('findPageForStreamIndex', () => {
  it('maps a stream cursor back to the page that contains it', () => {
    expect(findPageForStreamIndex([0, 4, 9], 0)).toBe(0);
    expect(findPageForStreamIndex([0, 4, 9], 4)).toBe(1);
    expect(findPageForStreamIndex([0, 4, 9], 8)).toBe(1);
    expect(findPageForStreamIndex([0, 4, 9], 12)).toBe(2);
  });
});
