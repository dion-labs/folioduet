import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initSync, toMarkdownBytes } from '@firecrawl/anydoc-wasm';
import * as pdfjsLib from 'pdfjs-dist';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractPdfMarkdownPages } from './pdfStream';
import { normalizeExtractedMarkdownPages } from './documentNormalization';
import { buildBookStream } from './documents';

import { createSyntheticPdf } from '../../tools/qa/pdf-fixtures';

beforeAll(() => {
    const require = createRequire(import.meta.url);
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),
    ).href;
    initSync({ module: readFileSync(resolve(
      dirname(require.resolve('@firecrawl/anydoc-wasm/package.json')), 'anydoc_wasm_bg.wasm',
    )) });
});

describe('real PDF processor integration', () => {
  it('applies shared repair to real PDF.js and AnyDoc output', async () => {
    const bytes = createSyntheticPdf([['Architecture supports long-term planning.', 'Good archi-', 'tecture supports long- term planning.']]);
    const pdfJsPages = await extractPdfMarkdownPages(new File([bytes], 'synthetic.pdf'), 'pageecho');
    const anydocPages = normalizeExtractedMarkdownPages([toMarkdownBytes(bytes, 'pdf')]);
    for (const pages of [pdfJsPages, anydocPages]) {
      const text = buildBookStream(pages, 'Synthetic document').map((block) => block.text).join(' ');
      expect(text).toContain('Good architecture supports long-term planning.');
      expect(text).not.toContain('longterm');
    }
  });
});


describe('real extraction failure and long-document matrix', () => {
  it.each(['pageecho', 'anydoc'] as const)('preserves all 200 ordered sentinels with %s', async (engine) => {
    const lines = Array.from({ length: 200 }, (_, i) => [`Unique marker number ${i} completes this sentence.`]);
    const bytes = createSyntheticPdf([[], ...lines, []]);
    const pages = engine === 'pageecho'
      ? await extractPdfMarkdownPages(new File([bytes], 'long.pdf'), engine)
      : normalizeExtractedMarkdownPages([toMarkdownBytes(bytes, 'pdf')]);
    const text = buildBookStream(pages, 'Synthetic document').map((b) => b.text).join(' ');
    const markers = [...text.matchAll(/Unique marker number (\d+) completes this sentence\./g)].map((m) => Number(m[1]));
    expect(markers).toEqual(Array.from({ length: 200 }, (_, i) => i));
  }, 30_000);

  it('rejects malformed and zero-byte PDFs then accepts another valid PDF', async () => {
    for (const input of ['', 'not a PDF']) {
      await expect(extractPdfMarkdownPages(new File([input], 'invalid.pdf'), 'pageecho')).rejects.toThrow();
    }
    const result = await extractPdfMarkdownPages(new File([createSyntheticPdf([['Recovery sentinel.']])], 'valid.pdf'));
    expect(result.join('')).toContain('Recovery sentinel.');
  });

  it('handles text-free input as empty PDF.js output or an explicit AnyDoc OCR error', async () => {
    const bytes = createSyntheticPdf([[], []]);
    expect(await extractPdfMarkdownPages(new File([bytes], 'empty.pdf'))).toEqual([]);
    expect(() => toMarkdownBytes(bytes, 'pdf')).toThrow(/OCR is required/);
  });
});
