import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { initSync, toMarkdownBytes } from '@firecrawl/anydoc-wasm';
import * as pdfjsLib from 'pdfjs-dist';
import { describe, expect, it } from 'vitest';
import { extractPdfMarkdownPages } from './pdfStream';
import { normalizeExtractedMarkdownPages } from './documentNormalization';
import { buildBookStream } from './documents';

/** Invented text, standard PDF font, and an explicit physical line wrap. */
function syntheticPdf(): Uint8Array<ArrayBuffer> {
  const content = 'BT /F1 12 Tf 72 720 Td (Architecture supports long-term planning.) Tj '
    + '0 -24 Td (Good archi-) Tj 0 -16 Td (tecture supports long- term planning.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe('real PDF processor integration', () => {
  it('applies shared repair to real PDF.js and AnyDoc output', async () => {
    const require = createRequire(import.meta.url);
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),
    ).href;
    initSync({ module: readFileSync(resolve(
      dirname(require.resolve('@firecrawl/anydoc-wasm/package.json')), 'anydoc_wasm_bg.wasm',
    )) });
    const bytes = syntheticPdf();
    const pdfJsPages = await extractPdfMarkdownPages(new File([bytes], 'synthetic.pdf'), 'pageecho');
    const anydocPages = normalizeExtractedMarkdownPages([toMarkdownBytes(bytes, 'pdf')]);
    for (const pages of [pdfJsPages, anydocPages]) {
      const text = buildBookStream(pages, 'Synthetic document').map((block) => block.text).join(' ');
      expect(text).toContain('Good architecture supports long-term planning.');
      expect(text).not.toContain('longterm');
    }
  });
});
