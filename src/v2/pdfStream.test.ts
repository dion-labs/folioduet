import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist';
import { describe, expect, it } from 'vitest';
import { loadPdfStream, pdfLinesToParagraphs, pdfTextItemsToLines } from './pdfStream';

describe('pdfTextItemsToLines', () => {
  it('joins fragments and honors end-of-line markers', () => {
    const lines = pdfTextItemsToLines([
      { str: 'The' },
      { str: 'Mythical' },
      { str: 'Man-Month', hasEOL: true },
      { str: 'Frederick' },
      { str: 'Brooks', hasEOL: true },
    ]);
    expect(lines).toEqual(['The Mythical Man-Month', 'Frederick Brooks']);
  });

  it('rejoins hyphenated wraps', () => {
    const lines = pdfTextItemsToLines([
      { str: 'responsibil-' },
      { str: 'ity', hasEOL: true },
    ]);
    expect(lines).toEqual(['responsibility']);
  });

  it('skips empty pages', () => {
    expect(pdfTextItemsToLines([{ str: '   ' }, { str: '', hasEOL: true }])).toEqual([]);
  });
});

describe('pdfLinesToParagraphs', () => {
  it('keeps short title lines as their own blocks', () => {
    expect(pdfLinesToParagraphs([
      'The Second-System Effect',
      'If one separates responsibility for functional specification from responsibility for building a fast cheap product what happens.',
    ])).toEqual([
      'The Second-System Effect',
      'If one separates responsibility for functional specification from responsibility for building a fast cheap product what happens.',
    ]);
  });
});

const mmmPath = '.scratch/mmm-eval/source.pdf';

describe.runIf(existsSync(mmmPath))('loadPdfStream (MMM fixture)', () => {
  it('skips empty cover pages and yields speakable blocks', async () => {
    const require = createRequire(import.meta.url);
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),
    ).href;

    const buf = readFileSync(mmmPath);
    const file = new File([buf], 'mmm.pdf', { type: 'application/pdf' });
    const stream = await loadPdfStream(file, 'The Mythical Man-Month');
    expect(stream.length).toBeGreaterThan(20);
    expect(stream.some((block) => /second.?system|man.?month|brooks/i.test(block.text))).toBe(true);
    expect(stream.every((block) => block.text.trim().length > 0)).toBe(true);
  }, 60_000);
});
