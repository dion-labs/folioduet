import JSZip from 'jszip';
import { parsePageMarkdown, type MarkdownBlock } from '../hooks/useTTS';
import {
  packStreamByWords,
  pagesToMarkdown,
  type BookStreamBlock,
} from './bookStream';

const PAGE_MD = /(^|\/)page_\d+\.md$/i;
const PE_COMMENT = /^<!--\s*pe:([^>]*?)-->\s*$/i;

/** Fallback reading-page size before viewport measurement is available. */
export const DEFAULT_WORDS_PER_PAGE = 300;

export type { BookStreamBlock };

export async function extractMarkdownPages(file: File): Promise<string[]> {
  const archive = await JSZip.loadAsync(file);
  const markdownFiles = Object.keys(archive.files)
    .filter((name) => {
      if (archive.files[name].dir) return false;
      // Prefer explicit page_NNN.md; fall back to any .md at archive root for older zips.
      if (PAGE_MD.test(name)) return true;
      const base = name.split('/').pop() ?? name;
      const depth = name.split('/').filter(Boolean).length;
      return depth === 1 && base.toLowerCase().endsWith('.md');
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  if (markdownFiles.length === 0) {
    throw new Error('This archive does not contain any Markdown page files.');
  }

  return Promise.all(markdownFiles.map((name) => archive.files[name].async('string')));
}

function normalizeTitle(value: string): string {
  return value
    .replace(/\.(pdf|zip)$/i, '')
    .replace(/\s*\((?:markdown|zip|markdown zip)\)\s*/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function isPageFurniture(text: string, documentName: string, blockIndex: number): boolean {
  const normalizedText = normalizeTitle(text);
  if (!normalizedText) return true;

  if (/^(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(text.trim())) {
    return true;
  }

  if (blockIndex <= 3) {
    const normalizedDocumentName = normalizeTitle(documentName);
    const shortEnough = normalizedText.split(/\s+/).length <= 16;
    if (
      shortEnough &&
      normalizedDocumentName.length >= 5 &&
      (normalizedText.includes(normalizedDocumentName) || normalizedDocumentName.includes(normalizedText))
    ) {
      return true;
    }
  }

  return false;
}

/** Drop chrome that PageEcho already shows in the reader toolbar. */
function stripLegacyPageChrome(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/^#\s+[^\n]+\n+##\s+Page\s+\d+\s*\n+/i, '')
    .replace(/^##\s+Page\s+\d+\s*\n+/i, '');
}

type PeSegment = {
  markdown: string;
  ttsSkip: boolean;
  hide: boolean;
};

function splitPeAnnotatedSegments(markdown: string): PeSegment[] {
  const segments = markdown.split(/\n{2,}/);
  const result: PeSegment[] = [];

  for (const segment of segments) {
    const lines = segment.split('\n');
    let ttsSkip = false;
    let hide = false;
    const contentLines: string[] = [];

    for (const line of lines) {
      const match = line.trim().match(PE_COMMENT);
      if (match) {
        const attrs = match[1];
        if (/tts\s*=\s*skip/i.test(attrs)) ttsSkip = true;
        if (/role\s*=\s*(?:furniture|caption)/i.test(attrs)) hide = true;
        continue;
      }
      contentLines.push(line);
    }

    const content = contentLines.join('\n').trim();
    if (!content) continue;
    result.push({ markdown: content, ttsSkip, hide });
  }

  return result;
}

function reindexBlocks(blocks: MarkdownBlock[]): MarkdownBlock[] {
  let currentOffset = 0;
  return blocks.map((block) => {
    const next = { ...block, globalWordOffset: currentOffset };
    currentOffset += block.tokens.length;
    return next;
  });
}

export function prepareMarkdownPage(
  markdown: string,
  documentName: string,
): { renderedBlocks: MarkdownBlock[]; speakableBlocks: string[] } {
  const segments = splitPeAnnotatedSegments(stripLegacyPageChrome(markdown));
  const renderedBlocks: MarkdownBlock[] = [];
  const speakableBlocks: string[] = [];

  for (const segment of segments) {
    // Reading layer = speakable layer. Skip anything TTS would ignore.
    if (segment.hide || segment.ttsSkip) continue;

    const parsed = parsePageMarkdown(segment.markdown);
    for (const block of parsed) {
      // Title / bare page numbers already live in app chrome — drop from the page body.
      if (isPageFurniture(block.text, documentName, renderedBlocks.length)) {
        continue;
      }
      renderedBlocks.push(block);
      speakableBlocks.push(block.text);
    }
  }

  return {
    renderedBlocks: reindexBlocks(renderedBlocks),
    speakableBlocks,
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function blockToMarkdown(block: MarkdownBlock): string {
  const raw = block.raw?.trim();
  if (raw) return raw;
  if (block.type.startsWith('h')) {
    const level = Number(block.type.slice(1)) || 3;
    return `${'#'.repeat(level)} ${block.text}`;
  }
  if (block.type === 'blockquote') return `> ${block.text}`;
  if (block.type === 'li') return `- ${block.text}`;
  return block.text;
}

function isChapterBreak(block: MarkdownBlock): boolean {
  if (!block.type.startsWith('h')) return false;
  return countWords(block.text) <= 12;
}

/**
 * Naive PDF→MD zips often have no ### headings — titles sit as short early lines
 * that later get jammed into one paragraph. Pull those lines back out as chapters.
 */
export function extractPlainChapterTitle(sourcePage: string, documentName: string): string | null {
  const stripped = stripLegacyPageChrome(sourcePage)
    .replace(/^<!--[\s\S]*?-->\s*/gm, '')
    .trim();
  if (!stripped) return null;

  const lines = stripped
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s/.test(line));

  const titleParts: string[] = [];
  for (const line of lines.slice(0, 5)) {
    if (/^\d+$/.test(line)) continue; // chapter number alone on a title page

    const cleaned = line
      .replace(/^[ivxlcdm]+\s+/i, '')
      .replace(/\s+[ivxlcdm]+$/i, '')
      .replace(/\s+\d+$/g, '')
      .replace(/^\d+\s+/, '')
      .replace(/[,:;]+$/g, '')
      .trim();
    if (!cleaned) continue;
    if (/photo credit|about the author|copyright|all rights reserved/i.test(cleaned)) break;

    const words = countWords(cleaned);
    const shortTitle = cleaned.length <= 52 && words >= 2 && words <= 8 && !/[.!?]$/.test(cleaned);
    const startsLikeTitle = /^[\p{Lu}\p{N}"“‘]/u.test(cleaned);
    if (!shortTitle || !startsLikeTitle) break;
    if (normalizeTitle(cleaned) === normalizeTitle(documentName)) break;

    if (titleParts.length && normalizeTitle(titleParts.join(' ')) === normalizeTitle(cleaned)) {
      break; // repeated running header / same title twice
    }
    titleParts.push(cleaned);
  }

  if (titleParts.length === 0) return null;
  const title = titleParts.join(' ').replace(/\s+/g, ' ').trim();
  if (countWords(title) < 2 || countWords(title) > 10) return null;
  if (normalizeTitle(title) === normalizeTitle(documentName)) return null;
  if (/essays on software engineering/i.test(title)) return null;
  return title;
}

function pushStreamBlock(stream: BookStreamBlock[], block: Omit<BookStreamBlock, 'key' | 'words'> & { key?: string }) {
  const key = block.key ?? normalizeTitle(block.text);
  const previous = stream[stream.length - 1];
  if (previous && block.chapterBreak && previous.chapterBreak && previous.key === key) {
    return;
  }
  stream.push({
    ...block,
    key,
    words: Math.max(1, countWords(block.text)),
  });
}

/** Flatten source PDF-page markdown into a continuous speakable reading stream. */
export function buildBookStream(sourcePages: string[], documentName: string): BookStreamBlock[] {
  const stream: BookStreamBlock[] = [];

  for (const sourcePage of sourcePages) {
    const prepared = prepareMarkdownPage(sourcePage, documentName);
    const hasHeadingChapter = prepared.renderedBlocks.some((block) => isChapterBreak(block));
    if (!hasHeadingChapter) {
      const plainTitle = extractPlainChapterTitle(sourcePage, documentName);
      if (plainTitle) {
        pushStreamBlock(stream, {
          markdown: `### ${plainTitle}`,
          text: plainTitle,
          inlineRuns: [{ text: plainTitle }],
          type: 'h3',
          chapterBreak: true,
        });
      }
    }

    for (const block of prepared.renderedBlocks) {
      pushStreamBlock(stream, {
        markdown: blockToMarkdown(block),
        text: block.text,
        inlineRuns: block.inlineRuns,
        type: block.type,
        chapterBreak: isChapterBreak(block),
      });
    }
  }

  return stream;
}

/**
 * Pack source PDF-page markdown into fixed-size PageEcho reading pages.
 * Prefer viewport packing in the app; this word-budget path is the fallback/tests.
 */
export function reflowBookPages(
  sourcePages: string[],
  documentName: string,
  wordsPerPage = DEFAULT_WORDS_PER_PAGE,
): string[] {
  const stream = buildBookStream(sourcePages, documentName);
  if (stream.length === 0) return ['\n'];
  return pagesToMarkdown(packStreamByWords(stream, wordsPerPage).pages);
}

/** Extract zip pages into a continuous speakable stream (viewport-paginated later). */
export async function loadMarkdownStream(
  file: File,
  documentName: string,
): Promise<BookStreamBlock[]> {
  const sourcePages = await extractMarkdownPages(file);
  return buildBookStream(sourcePages, documentName);
}

/** @deprecated Prefer loadMarkdownStream + viewport pack. Kept for provisional page counts. */
export async function loadMarkdownBook(
  file: File,
  documentName: string,
  wordsPerPage = DEFAULT_WORDS_PER_PAGE,
): Promise<string[]> {
  const stream = await loadMarkdownStream(file, documentName);
  if (stream.length === 0) return ['\n'];
  return pagesToMarkdown(packStreamByWords(stream, wordsPerPage).pages);
}

export function calculateProgress(pageIndex: number, totalPages: number, wordIndex = 0): number {
  if (totalPages <= 0) return 0;
  const pageFraction = Math.min(0.95, Math.max(0, wordIndex) / 1000);
  return Math.min(100, Math.max(0, ((pageIndex + pageFraction) / totalPages) * 100));
}

export function formatRelativeDate(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;

  if (delta < minute) return 'Just now';
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  if (delta < day * 7) return `${Math.floor(delta / day)}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}
