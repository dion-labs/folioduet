import { describe, expect, it } from 'vitest';
import { normalizeExtractedMarkdownPages, repairWrapHyphenation } from './documentNormalization';

describe('repairWrapHyphenation', () => {
  it('joins wrapped words when the document contains strong lexical evidence', () => {
    const result = repairWrapHyphenation(
      'Architecture shapes systems. Good archi- tecture makes change easier.',
    );

    expect(result.markdown).toBe(
      'Architecture shapes systems. Good architecture makes change easier.',
    );
    expect(result.stats).toEqual({ candidates: 1, joined: 1, retained: 0, skipped: 0 });
  });

  it('repairs spacing but retains uncertain or evidenced compound hyphens', () => {
    const result = repairWrapHyphenation([
      'Prefer a long- term view.',
      'A recreation differs from re- creation, and re-creation appears elsewhere.',
    ].join('\n'));

    expect(result.markdown).toBe([
      'Prefer a long-term view.',
      'A recreation differs from re-creation, and re-creation appears elsewhere.',
    ].join('\n'));
    expect(result.stats).toEqual({ candidates: 2, joined: 0, retained: 2, skipped: 0 });
  });

  it('leaves Markdown code, link destinations, URLs, and tables untouched', () => {
    const markdown = [
      '`archi- tecture` and https://example.com/archi- tecture',
      '[guide](https://example.com/archi- tecture)',
      '| archi- tecture | value |',
      '```text',
      'archi- tecture',
      '```',
    ].join('\n');
    const result = repairWrapHyphenation(markdown);

    expect(result.markdown).toBe(markdown);
    expect(result.stats).toEqual({ candidates: 5, joined: 0, retained: 0, skipped: 5 });
  });
});

describe('normalizeExtractedMarkdownPages', () => {
  it('normalizes line endings and emits one continuous source document', () => {
    expect(normalizeExtractedMarkdownPages(['# Chapter\r\n\r\nA paragraph.'])).toEqual([
      '# Chapter\n\nA paragraph.\n',
    ]);
  });

  it('applies conservative wrap repair to converted AnyDoc Markdown', () => {
    expect(normalizeExtractedMarkdownPages([
      'Architecture matters.\n\nGood archi- tecture lasts.',
    ])).toEqual([
      'Architecture matters.\n\nGood architecture lasts.\n',
    ]);
  });

  it('does not emit an empty document', () => {
    expect(normalizeExtractedMarkdownPages(['  \n '])).toEqual([]);
  });
});


describe('shared document normalization contract', () => {
  it('uses evidence across source pages without losing page boundaries', () => {
    expect(normalizeExtractedMarkdownPages([
      'Architecture supports long-term planning.\r\n',
      'Good archi- tecture supports long- term planning.\r',
    ])).toEqual([
      'Architecture supports long-term planning.\n',
      'Good architecture supports long-term planning.\n',
    ]);
  });

  it('is idempotent for synced content and preserves indentation and Markdown structures', () => {
    const source = [
      '    archi- tecture\n\nArchitecture matters.\n\nGood archi- tecture lasts.\n',
      '```text\narchi- tecture\n```\n\n| long- term | code |\n',
    ];
    const normalized = normalizeExtractedMarkdownPages(source);
    expect(normalized[0].startsWith('    archi- tecture\n')).toBe(true);
    expect(normalized[0]).toContain('Good architecture lasts.');
    expect(normalized[1]).toBe(source[1]);
    expect(normalizeExtractedMarkdownPages(normalized)).toEqual(normalized);
  });
});
