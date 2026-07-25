import { describe, expect, it } from 'vitest';
import { calculateProgress, prepareMarkdownPage } from './documents';

describe('prepareMarkdownPage', () => {
  it('keeps rendered page furniture but excludes it from speech', () => {
    const page = [
      '# The Mythical Man-Month',
      '',
      'Page 12',
      '',
      'The bearing of a child takes nine months.',
    ].join('\n');

    const result = prepareMarkdownPage(page, 'The Mythical Man-Month (Markdown ZIP)');

    expect(result.renderedBlocks.map((block) => block.text)).toEqual([
      'The Mythical Man-Month',
      'Page 12',
      'The bearing of a child takes nine months.',
    ]);
    expect(result.speakableBlocks).toEqual([
      '',
      '',
      'The bearing of a child takes nine months.',
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

