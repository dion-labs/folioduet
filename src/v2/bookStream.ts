import { tokenizeBlock, type MarkdownBlock } from '../hooks/useTTS';

export type BookStreamBlock = {
  markdown: string;
  text: string;
  type: MarkdownBlock['type'];
  chapterBreak: boolean;
  key: string;
  words: number;
};

type PackHeightOptions = {
  /** Optional stacked-page measure; used to peel overflow after greedy pack. */
  measurePage?: (page: BookStreamBlock[]) => number;
};

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function sliceBlock(block: BookStreamBlock, text: string, part: number): BookStreamBlock {
  const trimmed = text.trim();
  const keepHeading = block.chapterBreak && part === 0;
  return {
    ...block,
    text: trimmed,
    markdown: keepHeading ? block.markdown : trimmed,
    chapterBreak: keepHeading,
    key: part === 0 ? block.key : `${block.key}::${part}`,
    words: countWords(trimmed),
  };
}

function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g);
  if (!matches) return [text.trim()].filter(Boolean);
  return matches.map((part) => part.trim()).filter(Boolean);
}

/**
 * Split a single block into pieces that each fit within `budget`.
 * Sentence breaks first; word breaks only when one sentence is still too tall.
 */
export function splitBlockToFit(
  block: BookStreamBlock,
  budget: number,
  measureHeight: (block: BookStreamBlock) => number,
): BookStreamBlock[] {
  if (block.chapterBreak || measureHeight(block) <= budget) {
    return [block];
  }

  const sentences = splitIntoSentences(block.text);
  const sentenceChunks: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (buffer && measureHeight(sliceBlock(block, candidate, 0)) > budget) {
      sentenceChunks.push(buffer);
      buffer = sentence;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) sentenceChunks.push(buffer);

  const pieces: BookStreamBlock[] = [];
  let part = 0;

  for (const chunk of sentenceChunks) {
    let candidate = sliceBlock(block, chunk, part);
    if (measureHeight(candidate) <= budget) {
      pieces.push(candidate);
      part += 1;
      continue;
    }

    const words = chunk.split(/\s+/).filter(Boolean);
    let wordBuf: string[] = [];
    for (const word of words) {
      const next = [...wordBuf, word].join(' ');
      const test = sliceBlock(block, next, part);
      if (wordBuf.length > 0 && measureHeight(test) > budget) {
        pieces.push(sliceBlock(block, wordBuf.join(' '), part));
        part += 1;
        wordBuf = [word];
      } else {
        wordBuf.push(word);
      }
    }
    if (wordBuf.length > 0) {
      pieces.push(sliceBlock(block, wordBuf.join(' '), part));
      part += 1;
    }
  }

  return pieces.length > 0 ? pieces : [block];
}

/**
 * Expand stream so no single block is taller than the page budget.
 * Without this, a tall paragraph alone on a page gets clipped by overflow:hidden
 * and the clipped remainder never appears on the next page.
 *
 * Pass `knownHeights` from a prior batched measure pass so we only call
 * `measureHeight` for blocks that actually need splitting (and their slices).
 */
export function expandStreamForBudget(
  stream: BookStreamBlock[],
  budget: number,
  measureHeight: (block: BookStreamBlock) => number,
  knownHeights?: number[],
): BookStreamBlock[] {
  if (stream.length === 0 || budget <= 0) return stream;
  const out: BookStreamBlock[] = [];
  for (let index = 0; index < stream.length; index += 1) {
    const block = stream[index];
    const known = knownHeights?.[index];
    if (block.chapterBreak || (known !== undefined ? known <= budget : measureHeight(block) <= budget)) {
      out.push(block);
      continue;
    }
    out.push(...splitBlockToFit(block, budget, measureHeight));
  }
  return out;
}

/** Pack a stream into pages using pre-measured block heights (viewport-adaptive). */
export function packStreamByHeight(
  stream: BookStreamBlock[],
  heights: number[],
  maxHeight: number,
  options: PackHeightOptions = {},
): { pages: BookStreamBlock[][]; pageStarts: number[] } {
  if (stream.length === 0) {
    return { pages: [], pageStarts: [] };
  }

  const budget = Math.max(80, maxHeight);
  const pages: BookStreamBlock[][] = [];
  const pageStarts: number[] = [];
  let buffer: BookStreamBlock[] = [];
  let used = 0;
  let start = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    pages.push(buffer);
    pageStarts.push(start);
    buffer = [];
    used = 0;
  };

  for (let index = 0; index < stream.length; index += 1) {
    const block = stream[index];
    const height = Math.max(1, heights[index] ?? 24);

    if (block.chapterBreak && buffer.length > 0) {
      flush();
      start = index;
    } else if (buffer.length > 0 && used + height > budget) {
      flush();
      start = index;
    }

    if (buffer.length === 0) start = index;
    buffer.push(block);
    used += height;

    // Pathologically tall block: alone on its page so we still advance.
    if (buffer.length === 1 && height > budget && index + 1 < stream.length) {
      flush();
      start = index + 1;
    }
  }
  flush();

  if (!options.measurePage || pages.length === 0) {
    return { pages, pageStarts };
  }

  // Peel trailing blocks when the real stacked layout exceeds the budget.
  // Individual block heights miss margin-collapse / wrap differences.
  const tightened: BookStreamBlock[][] = [];
  let spill: BookStreamBlock[] = [];

  for (const page of pages) {
    let current = spill.length ? [...spill, ...page] : [...page];
    spill = [];
    while (current.length > 1 && options.measurePage(current) > budget) {
      spill.unshift(current.pop()!);
    }
    tightened.push(current);
  }

  while (spill.length > 0) {
    let current = [spill.shift()!];
    while (spill.length > 0) {
      const next = spill[0];
      if (next.chapterBreak) break;
      const candidate = [...current, next];
      if (options.measurePage(candidate) > budget) break;
      current = candidate;
      spill.shift();
    }
    tightened.push(current);
  }

  let cursor = 0;
  const starts = tightened.map((page) => {
    const at = cursor;
    cursor += page.length;
    return at;
  });

  return { pages: tightened, pageStarts: starts };
}

/** Word-budget packer (tests / SSR fallback before viewport measure). */
export function packStreamByWords(
  stream: BookStreamBlock[],
  wordsPerPage: number,
): { pages: BookStreamBlock[][]; pageStarts: number[] } {
  const pages: BookStreamBlock[][] = [];
  const pageStarts: number[] = [];
  let buffer: BookStreamBlock[] = [];
  let words = 0;
  let start = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    pages.push(buffer);
    pageStarts.push(start);
    buffer = [];
    words = 0;
  };

  for (let index = 0; index < stream.length; index += 1) {
    const block = stream[index];
    if (block.chapterBreak && buffer.length > 0) {
      flush();
      start = index;
    } else if (buffer.length > 0 && words + block.words > wordsPerPage) {
      flush();
      start = index;
    }
    if (buffer.length === 0) start = index;
    buffer.push(block);
    words += block.words;
  }
  flush();
  return { pages, pageStarts };
}

export function streamPageToMarkdownBlocks(page: BookStreamBlock[]): MarkdownBlock[] {
  let offset = 0;
  return page.map((block) => {
    const tokens = tokenizeBlock(block.text);
    const next: MarkdownBlock = {
      type: block.type,
      text: block.text,
      raw: block.markdown,
      tokens,
      globalWordOffset: offset,
    };
    offset += tokens.length;
    return next;
  });
}

export function findPageForStreamIndex(pageStarts: number[], streamIndex: number): number {
  if (pageStarts.length === 0) return 0;
  let page = 0;
  for (let i = 0; i < pageStarts.length; i += 1) {
    if (pageStarts[i] <= streamIndex) page = i;
    else break;
  }
  return page;
}

export function pagesToMarkdown(pages: BookStreamBlock[][]): string[] {
  return pages.map((page) => `${page.map((block) => block.markdown).join('\n\n')}\n`);
}
