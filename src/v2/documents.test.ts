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

  it('hides Roman page numbers and numbered running-header copies', () => {
    const page = [
      '#### Preface to the Anniversary Edition',
      '',
      'Opening paragraph.',
      '',
      '**Vll**',
      '',
      '**viii Preface to the Anniversary Edition**',
      '',
      'Middle paragraph.',
      '',
      '**Preface to the Anniversary Edition ix**',
      '',
      'Closing paragraph.',
    ].join('\n');

    const result = prepareMarkdownPage(page, 'Example');

    expect(result.renderedBlocks.map((block) => block.text)).toEqual([
      'Preface to the Anniversary Edition',
      'Opening paragraph.',
      'Middle paragraph.',
      'Closing paragraph.',
    ]);
    expect(result.speakableBlocks).toEqual([
      'Preface to the Anniversary Edition',
      'Opening paragraph.',
      'Middle paragraph.',
      'Closing paragraph.',
    ]);
  });

  it('preserves Roman-numeral headings and unmatched numbered prose', () => {
    const page = [
      '## VII',
      '',
      '**viii An independent observation**',
      '',
      'I',
      '',
      'mix',
    ].join('\n');

    const result = prepareMarkdownPage(page, 'Example');

    expect(result.renderedBlocks.map((block) => block.text)).toEqual([
      'VII',
      'viii An independent observation',
      'I',
      'mix',
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

describe('buildBookStream semantic chapter boundaries', () => {
  it('keeps deep subheadings on the same adaptive page as nearby prose', () => {
    const stream = buildBookStream([
      [
        '#### 1 A Verified Chapter',
        '',
        'The opening paragraph introduces the subject.',
        '',
        '##### A short visual subheading',
        '',
        'The following paragraph continues the same chapter.',
      ].join('\n'),
    ], 'Example');

    expect(stream.map((block) => ({ text: block.text, chapter: block.chapterBreak }))).toEqual([
      { text: '1 A Verified Chapter', chapter: true },
      { text: 'The opening paragraph introduces the subject.', chapter: false },
      { text: 'A short visual subheading', chapter: false },
      { text: 'The following paragraph continues the same chapter.', chapter: false },
    ]);
    expect(reflowBookPages([
      '#### 1 A Verified Chapter\n\nFirst paragraph.\n\n##### Subheading\n\nSecond paragraph.',
    ], 'Example', 100)).toHaveLength(1);
  });

  it('does not mistake a printed page number in a deep heading for a chapter', () => {
    const stream = buildBookStream([
      '##### 128 Sharp Tools\n\nThe existing chapter continues here.',
    ], 'Example');

    expect(stream[0]).toMatchObject({ text: '128 Sharp Tools', chapterBreak: false });
  });

  it('merges split chapter titles and drops an adjacent duplicate extraction copy', () => {
    const stream = buildBookStream([
      [
        '#### 7 Why Did the Tower',
        '#### of Babel Fail?',
        '#### 7 Why Did theTower',
        '#### of Babel Fail?',
        '',
        'The chapter body begins here.',
      ].join('\n'),
    ], 'Example');

    expect(stream.map((block) => block.text)).toEqual([
      '7 Why Did the Tower of Babel Fail?',
      'The chapter body begins here.',
    ]);
    expect(stream.filter((block) => block.chapterBreak)).toHaveLength(1);
  });

  it('starts a fresh adaptive page at each verified chapter', () => {
    const pages = reflowBookPages([
      [
        '#### 1 First Chapter',
        '',
        'First chapter body.',
        '',
        '#### 2 Second Chapter',
        '',
        'Second chapter body.',
      ].join('\n'),
    ], 'Example', 1000);

    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('First chapter body.');
    expect(pages[0]).not.toContain('Second Chapter');
    expect(pages[1]).toContain('2 Second Chapter');
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
