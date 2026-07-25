import JSZip from 'jszip';
import { parsePageMarkdown, type MarkdownBlock } from '../hooks/useTTS';

export async function extractMarkdownPages(file: File): Promise<string[]> {
  const archive = await JSZip.loadAsync(file);
  const markdownFiles = Object.keys(archive.files)
    .filter((name) => !archive.files[name].dir && name.toLowerCase().endsWith('.md'))
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

export function prepareMarkdownPage(
  markdown: string,
  documentName: string,
): { renderedBlocks: MarkdownBlock[]; speakableBlocks: string[] } {
  const renderedBlocks = parsePageMarkdown(markdown);
  const speakableBlocks = renderedBlocks.map((block, index) => (
    isPageFurniture(block.text, documentName, index) ? '' : block.text
  ));

  return { renderedBlocks, speakableBlocks };
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

