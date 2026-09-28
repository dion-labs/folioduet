import { parsePageMarkdown } from '../hooks/useTTS';

export function words(text: string): string[] {
  return text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) ?? [];
}

/** Ordered edit distance; capped to keep spot-page comparisons responsive. */
export function compareMarkdown(reference: string, actual: string) {
  const expectedBlocks = parsePageMarkdown(reference);
  const actualBlocks = parsePageMarkdown(actual);
  const a = words(expectedBlocks.map(b => b.text).join(' '));
  const b = words(actualBlocks.map(b => b.text).join(' '));
  if (a.length > 5000 || b.length > 5000) throw new Error('Compare spot pages of at most 5,000 words.');
  let previous = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
    previous = current;
  }
  const edits = previous[b.length];
  return {
    referenceWords: a.length, actualWords: b.length, wordEdits: edits,
    orderedWordAccuracy: a.length ? Math.max(0, 1 - edits / a.length) : b.length ? 0 : 1,
    referenceParagraphs: expectedBlocks.filter(b => b.type === 'p').length,
    actualParagraphs: actualBlocks.filter(b => b.type === 'p').length,
    referenceHeadings: expectedBlocks.filter(b => /^h\d$/.test(b.type)).map(b => b.text),
    actualHeadings: actualBlocks.filter(b => /^h\d$/.test(b.type)).map(b => b.text),
  };
}
