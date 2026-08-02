import { describe, expect, it } from 'vitest';
import {
  buildBookStream,
  calculateProgress,
  extractPlainChapterTitle,
  prepareMarkdownPage,
  reflowBookPages,
} from './documents';
import { buildChapterIndex } from './chapters';

describe('prepareMarkdownPage', () => {
  it('hides page furniture from reading and speech', () => {
    const page = [
      '# The Mythical Man-Month',
      '',
      'Page 12',
      '',
      'The bearing of a child takes nine months.',
    ].join('\n');

    const result = prepareMarkdownPage(page, 'The Mythical Man-Month (Markdown ZIP)');

    expect(result.renderedBlocks.map((block) => block.text)).toEqual([
      'The bearing of a child takes nine months.',
    ]);
    expect(result.speakableBlocks).toEqual([
      'The bearing of a child takes nine months.',
    ]);
  });

  it('strips legacy # title / ## Page chrome from markdown pages', () => {
    const page = [
      '# Addison-Wesley: The Mythical Man-Month',
      '',
      '## Page 20',
      '',
      'Finally, the program must be tested with other system components.',
    ].join('\n');

    const result = prepareMarkdownPage(page, 'Addison-Wesley: The Mythical Man-Month');

    expect(result.renderedBlocks.map((block) => block.text)).toEqual([
      'Finally, the program must be tested with other system components.',
    ]);
    expect(result.speakableBlocks).toEqual([
      'Finally, the program must be tested with other system components.',
    ]);
  });

  it('hides pe:tts=skip blocks from the reading layer entirely', () => {
    const page = [
      '<!-- pe:role=frontmatter pe:tts=skip -->',
      'Copyright © 1995 Addison-Wesley',
      '',
      'Chapter body begins here.',
    ].join('\n');

    const result = prepareMarkdownPage(page, 'Example');

    expect(result.renderedBlocks.map((block) => block.text)).toEqual([
      'Chapter body begins here.',
    ]);
    expect(result.speakableBlocks).toEqual([
      'Chapter body begins here.',
    ]);
  });

  it('hides pe furniture blocks from the reading layer', () => {
    const page = [
      '<!-- pe:role=furniture pe:tts=skip -->',
      'The Tar Pit',
      '',
      'Finally the program must be tested.',
    ].join('\n');

    const result = prepareMarkdownPage(page, 'Example');

    expect(result.renderedBlocks.map((block) => block.text)).toEqual([
      'Finally the program must be tested.',
    ]);
    expect(result.speakableBlocks).toEqual([
      'Finally the program must be tested.',
    ]);
  });

  it('preserves structural block indexes for highlighting and resume', () => {
    const result = prepareMarkdownPage('## Heading\n\nFirst paragraph.\n\nSecond paragraph.', 'Example');

    expect(result.renderedBlocks).toHaveLength(3);
    expect(result.speakableBlocks).toHaveLength(3);
    expect(result.renderedBlocks[2].globalWordOffset).toBeGreaterThan(
      result.renderedBlocks[1].globalWordOffset,
    );
  });
});

describe('extractPlainChapterTitle', () => {
  it('pulls short leading title lines out of naive PDF page dumps', () => {
    const page = [
      '# Addison-Wesley: The Mythical Man-Month',
      '',
      '## Page 21',
      '',
      'The Joys of the Craft 7',
      'The Joys of the Craft',
      'Why is programming fun? What delights may its practitioner',
    ].join('\n');

    expect(extractPlainChapterTitle(page, 'Addison_Wesley_The_Mythical_Man_Month')).toBe(
      'The Joys of the Craft',
    );
  });
});

describe('buildBookStream plain-title promotion', () => {
  it('adds chapter breaks for naive pages without markdown headings', () => {
    const pages = [
      [
        '# Addison-Wesley: The Mythical Man-Month',
        '',
        '## Page 8',
        '',
        'Preface to the 20th',
        'Anniversary Edition',
        'To my surprise and delight, The Mythical Man-Month continues',
        'to be popular after 20 years.',
      ].join('\n'),
      [
        '# Addison-Wesley: The Mythical Man-Month',
        '',
        '## Page 61',
        '',
        '5',
        'The Second-System Effect',
        'An architect’s first work is apt to be spare and clean. He knows',
        'he does not know what he is doing, so he does it carefully.',
      ].join('\n'),
    ];

    const stream = buildBookStream(pages, 'Addison_Wesley_The_Mythical_Man_Month');
    const chapters = buildChapterIndex(stream, { minFollowingWords: 10 });
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      'Preface to the 20th Anniversary Edition',
      'The Second-System Effect',
    ]);
  });
});

describe('reflowBookPages', () => {
  it('packs body across source pages and breaks early on chapter headings', () => {
    const source = [
      '### The Tar Pit\n\nFirst body paragraph with enough words to count toward the budget here.\n',
      'Second body paragraph continues the chapter without a heading of its own here.\n',
      '### The Joys of the Craft\n\nA fresh chapter should not share a page with the previous chapter body text.\n',
    ];

    const pages = reflowBookPages(source, 'Example', 40);

    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0]).toContain('### The Tar Pit');
    expect(pages[0]).toContain('First body paragraph');
    expect(pages.some((page) => page.includes('### The Joys of the Craft'))).toBe(true);
    const joysPage = pages.find((page) => page.includes('### The Joys of the Craft')) ?? '';
    expect(joysPage).not.toContain('First body paragraph');
  });

  it('drops duplicate consecutive chapter titles', () => {
    const source = [
      '### The Tar Pit\n',
      '### The Tar Pit\n\nNo scene from prehistory is quite so vivid as that of the tar pits.\n',
    ];

    const pages = reflowBookPages(source, 'Example', 200);
    const joined = pages.join('\n');
    expect(joined.match(/### The Tar Pit/g)).toHaveLength(1);
  });
});

describe('calculateProgress', () => {
  it('reports page-level progress without reaching 100 before the final page', () => {
    expect(calculateProgress(5, 10, 0)).toBe(50);
    expect(calculateProgress(9, 10, 500)).toBeLessThan(100);
  });

  it('clamps invalid positions into the progress range', () => {
    expect(calculateProgress(-10, 10)).toBe(0);
    expect(calculateProgress(99, 10, 9999)).toBe(100);
  });
});
