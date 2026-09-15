import { normalizeExtractedMarkdownPages } from './documentNormalization';
import * as pdfjsLib from 'pdfjs-dist';
import { buildBookStream } from './documents';
import type { BookStreamBlock } from './bookStream';
import type { PdfExtractor } from './types';

export type PdfExtractionResult = {
  pages: string[];
  requested: PdfExtractor;
  used: PdfExtractor;
  didFallback: boolean;
};

// Vite rewrites this worker URL for the browser bundle. Tests/Node may override
// GlobalWorkerOptions.workerSrc before calling loadPdfStream.
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
}

type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
};

/** Turn PDF.js text items into readable lines (skips blank ink). */
export function pdfTextItemsToLines(items: PdfTextItem[]): string[] {
  const lines: string[] = [];
  let line = '';

  const flushLine = () => {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (trimmed) lines.push(trimmed);
    line = '';
  };

  for (const item of items) {
    const str = typeof item.str === 'string' ? item.str : '';
    if (str) {
      if (
        line
        && !/\s$/.test(line)
        && !/^[\s.,;:!?)\]}'"”’]/.test(str)
      ) {
        line += ' ';
      }
      // Preserve hyphens and fragment separation. The shared repair stage uses
      // document-wide evidence instead of deleting possible compound hyphens.
      line += str;
    }
    if (item.hasEOL) flushLine();
  }
  flushLine();
  return lines;
}

/** Group lines into paragraph-sized markdown chunks for the reading stream. */
export function pdfLinesToParagraphs(lines: string[]): string[] {
  if (lines.length === 0) return [];

  const paragraphs: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    paragraphs.push(buffer.join(' ').replace(/\s+/g, ' ').trim());
    buffer = [];
  };

  // Reconstruct physical line wraps before paragraph heuristics. Keep the
  // hyphen decision for common normalization, including uncertain compounds.
  const logicalLines: string[] = [];
  for (const line of lines) {
    const previous = logicalLines.at(-1);
    if (previous?.endsWith('-') && /^\p{Ll}/u.test(line)) {
      logicalLines[logicalLines.length - 1] = `${previous} ${line}`;
    } else {
      logicalLines.push(line);
    }
  }

  for (const line of logicalLines) {
    const words = line.split(/\s+/).filter(Boolean).length;
    const titleLike = words <= 8 && line.length <= 72 && !/[.!?]$/.test(line);

    if (titleLike && buffer.length === 0) {
      paragraphs.push(line);
      continue;
    }

    buffer.push(line);
    const joinedWords = buffer.join(' ').split(/\s+/).filter(Boolean).length;
    if (/[.!?]["'”’]?$/.test(line) && joinedWords >= 35) {
      flush();
    }
  }
  flush();
  return paragraphs.filter(Boolean);
}

/**
 * Extract speakable markdown pages from every PDF page that has a text layer.
 * Blank / image-only pages (covers, photos) are skipped.
 */
async function extractPdfMarkdownPagesWithPdfJs(file: File): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const sourcePages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = pdfTextItemsToLines(content.items as PdfTextItem[]);
      const paragraphs = pdfLinesToParagraphs(lines);
      if (paragraphs.length > 0) {
        sourcePages.push(`${paragraphs.join('\n\n')}\n`);
      }
      // Yield so the UI can paint while large books extract on phones.
      if (pageNumber % 4 === 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }
    }
  } finally {
    await pdf.destroy();
  }

  return sourcePages;
}

/**
 * Extract PDF text with the selected local engine. AnyDoc is experimental;
 * if it cannot convert a file, retain the established PDF.js path as a fallback.
 */
export async function extractPdfMarkdown(
  file: File,
  extractor: PdfExtractor = 'pageecho',
): Promise<PdfExtractionResult> {
  if (extractor === 'anydoc') {
    try {
      const { extractPdfWithAnydoc } = await import('./anydocPdf');
      const pages = normalizeExtractedMarkdownPages(await extractPdfWithAnydoc(file));
      if (pages.length > 0) {
        return { pages, requested: extractor, used: 'anydoc', didFallback: false };
      }
    } catch (error) {
      console.warn('[FolioDuet] AnyDoc extraction failed; using PDF.js.', error);
    }
  }
  return {
    pages: normalizeExtractedMarkdownPages(await extractPdfMarkdownPagesWithPdfJs(file)),
    requested: extractor,
    used: 'pageecho',
    didFallback: extractor === 'anydoc',
  };
}

export async function extractPdfMarkdownPages(
  file: File,
  extractor: PdfExtractor = 'pageecho',
): Promise<string[]> {
  return (await extractPdfMarkdown(file, extractor)).pages;
}

/**
 * Extract speakable text from every PDF page that has a text layer, then
 * build the continuous reading stream (viewport packing happens separately).
 */
export async function loadPdfStream(
  file: File,
  documentName: string,
  extractor: PdfExtractor = 'pageecho',
): Promise<BookStreamBlock[]> {
  const sourcePages = await extractPdfMarkdownPages(file, extractor);
  if (sourcePages.length === 0) return [];
  return buildBookStream(sourcePages, documentName);
}
