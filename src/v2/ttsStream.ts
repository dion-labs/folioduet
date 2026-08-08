export type TtsStreamBlock = {
  key: string;
  text: string;
};

export type TtsStreamPosition = {
  streamIndex: number;
  pageIndex: number;
  blockIndex: number;
  wordIndex: number;
};

export function findSpeakableStreamBlock(
  blocks: TtsStreamBlock[],
  startIndex: number,
): number {
  for (let index = Math.max(0, startIndex); index < blocks.length; index += 1) {
    if (blocks[index]?.text.trim()) return index;
  }
  return -1;
}

/** Return upcoming speech in stream order, without knowing about visual pages. */
export function buildTtsLookAhead(
  blocks: TtsStreamBlock[],
  afterStreamIndex: number,
  maxBlocks = 3,
): string[] {
  if (!Number.isInteger(maxBlocks) || maxBlocks < 1) return [];

  const lookAhead: string[] = [];
  for (
    let index = Math.max(0, afterStreamIndex + 1);
    index < blocks.length && lookAhead.length < maxBlocks;
    index += 1
  ) {
    const text = blocks[index]?.text;
    if (text?.trim()) lookAhead.push(text);
  }
  return lookAhead;
}

/** Map a playback cursor to the current visual page; playback never depends on this mapping. */
export function resolveTtsStreamPosition(
  pageStarts: number[],
  streamIndex: number,
  wordIndex = 0,
): TtsStreamPosition {
  const safeStreamIndex = Math.max(0, Math.floor(streamIndex));
  let pageIndex = 0;

  for (let index = 0; index < pageStarts.length; index += 1) {
    const pageStart = pageStarts[index];
    if (!Number.isFinite(pageStart) || pageStart > safeStreamIndex) break;
    pageIndex = index;
  }

  const pageStart = pageStarts[pageIndex] ?? 0;
  return {
    streamIndex: safeStreamIndex,
    pageIndex,
    blockIndex: Math.max(0, safeStreamIndex - pageStart),
    wordIndex: Math.max(0, Math.floor(wordIndex)),
  };
}
