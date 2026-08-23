import type { BookStreamBlock } from './bookStream';
import { yieldToMain } from './yieldToMain';

function tagForType(type: BookStreamBlock['type']): string {
  if (type === 'li') return 'li';
  if (type === 'code') return 'pre';
  if (type === 'table-row') return 'div';
  return type;
}

/** Mirror ReaderWords so wrap/height matches the live page (pe-word spans matter). */
function fillTokenizedText(el: HTMLElement, text: string) {
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      el.append(part);
      continue;
    }
    const word = document.createElement('span');
    word.className = 'pe-word';
    word.textContent = part;
    el.append(word);
  }
}

function createMeasureHost(width: number, fontScale: number): { host: HTMLDivElement; prose: HTMLDivElement } {
  const host = document.createElement('div');
  host.className = 'pe-reading-page';
  host.style.cssText = [
    'position:absolute',
    'left:-10000px',
    'top:0',
    `width:${width}px`,
    'visibility:hidden',
    'pointer-events:none',
    'height:auto',
    'min-height:0',
    'padding:0',
    'border:0',
    'box-shadow:none',
    `--reader-scale:${fontScale}`,
  ].join(';');

  const prose = document.createElement('div');
  prose.className = 'pe-prose';
  host.appendChild(prose);
  document.body.appendChild(host);
  return { host, prose };
}

function appendBlock(prose: HTMLElement, block: BookStreamBlock) {
  const tag = tagForType(block.type);
  const el = document.createElement(tag);
  if (block.type === 'table-row') el.className = 'pe-markdown-table-row';
  fillTokenizedText(el, block.text);
  prose.appendChild(el);
  return el;
}

export type BookStreamMeasurer = {
  measureBlock: (block: BookStreamBlock) => number;
  measurePage: (page: BookStreamBlock[]) => number;
  measureHeights: (stream: BookStreamBlock[]) => number[];
  measureHeightsAsync: (
    stream: BookStreamBlock[],
    options?: { chunkSize?: number; signal?: { cancelled: boolean } },
  ) => Promise<number[]>;
  dispose: () => void;
};

/**
 * One offscreen measure host for a whole pack pass.
 * Creating/destroying a host per block was freezing the reader on long books.
 */
export function createBookStreamMeasurer(options: {
  width: number;
  fontScale: number;
}): BookStreamMeasurer {
  if (typeof document === 'undefined') {
    const guess = (block: BookStreamBlock) => Math.max(24, block.words * 8);
    return {
      measureBlock: guess,
      measurePage: (page) => page.reduce((sum, block) => sum + guess(block), 0),
      measureHeights: (stream) => stream.map(guess),
      measureHeightsAsync: async (stream) => stream.map(guess),
      dispose: () => undefined,
    };
  }

  const width = Math.max(200, Math.floor(options.width));
  const { host, prose } = createMeasureHost(width, options.fontScale);

  const measureBlock = (block: BookStreamBlock) => {
    prose.replaceChildren();
    const el = appendBlock(prose, block);
    return Math.max(1, Math.ceil(el.getBoundingClientRect().height));
  };

  const measurePage = (page: BookStreamBlock[]) => {
    if (page.length === 0) return 0;
    prose.replaceChildren();
    for (const block of page) appendBlock(prose, block);
    return Math.ceil(prose.getBoundingClientRect().height);
  };

  const measureHeights = (stream: BookStreamBlock[]) => stream.map(measureBlock);

  const measureHeightsAsync = async (
    stream: BookStreamBlock[],
    options: { chunkSize?: number; signal?: { cancelled: boolean } } = {},
  ) => {
    // Small chunks: each measureBlock forces layout; keep the UI interactive.
    const chunkSize = Math.max(4, options.chunkSize ?? 8);
    const heights: number[] = new Array(stream.length);
    for (let index = 0; index < stream.length; index += 1) {
      if (options.signal?.cancelled) throw new DOMException('Aborted', 'AbortError');
      heights[index] = measureBlock(stream[index]);
      if (index > 0 && index % chunkSize === 0) {
        await yieldToMain();
      }
    }
    return heights;
  };

  return {
    measureBlock,
    measurePage,
    measureHeights,
    measureHeightsAsync,
    dispose: () => {
      host.remove();
    },
  };
}

/**
 * Measure each stream block with the same prose styles / width / font scale
 * the reader uses, so pagination can fill the real viewport.
 */
export function measureBookStreamHeights(
  stream: BookStreamBlock[],
  options: { width: number; fontScale: number },
): number[] {
  if (stream.length === 0) return [];
  const measurer = createBookStreamMeasurer(options);
  try {
    return measurer.measureHeights(stream);
  } finally {
    measurer.dispose();
  }
}

/** Measure a packed page as one stack (captures margin collapse between blocks). */
export function measurePackedPageHeight(
  page: BookStreamBlock[],
  options: { width: number; fontScale: number },
): number {
  if (page.length === 0) return 0;
  const measurer = createBookStreamMeasurer(options);
  try {
    return measurer.measurePage(page);
  } finally {
    measurer.dispose();
  }
}

/**
 * Available height inside the cream page body for packed prose.
 * Leaves a one-line safety slack so the last line is never sheared by overflow.
 */
export function measurePageBodyBudget(
  pageBody: HTMLElement | null,
  fontScale = 1,
): number {
  if (!pageBody) return 0;
  const styles = window.getComputedStyle(pageBody);
  const paddingY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
  const contentHeight = Math.max(0, pageBody.clientHeight - paddingY);

  const prose = pageBody.querySelector('.pe-prose') as HTMLElement | null;
  const proseStyles = prose ? window.getComputedStyle(prose) : styles;
  const lineHeight = parseFloat(proseStyles.lineHeight) || (16 * fontScale * 1.78);
  // Keep ~1.25 lines of slack for wrap variance + mobile chrome jitter.
  const safety = Math.max(28, Math.ceil(lineHeight * 1.25));

  return Math.max(0, contentHeight - safety);
}

export function measurePageBodyContentWidth(pageBody: HTMLElement | null): number {
  if (!pageBody) return 0;
  const styles = window.getComputedStyle(pageBody);
  const paddingX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
  return Math.max(0, pageBody.clientWidth - paddingX);
}
