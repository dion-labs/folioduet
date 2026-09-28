export type TextRange = { start: number; end: number };

/** Exact word/punctuation alignment. Whitespace is preserved but not compared. */
export function textDifferences(reference: string, actual: string) {
  const tokenize = (text: string) => Array.from(text.matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu), match => ({
    text: match[0], start: match.index, end: match.index + match[0].length,
  }));
  const a = tokenize(reference), b = tokenize(actual);
  if (a.length > 6000 || b.length > 6000) return null;
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i].text === b[j].text
        ? 1 + table[(i + 1) * width + j + 1]
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const referenceRanges: TextRange[] = [], actualRanges: TextRange[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].text === b[j].text) { i++; j++; }
    else if (i < a.length && (j === b.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) {
      referenceRanges.push({start:a[i].start, end:a[i].end}); i++;
    } else { actualRanges.push({start:b[j].start, end:b[j].end}); j++; }
  }
  return { referenceRanges, actualRanges };
}

/** Slice highlights across inline formatting without losing original text. */
export function highlightParts(text: string, offset: number, ranges: TextRange[]) {
  const parts: {text: string; changed: boolean}[] = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.max(0, range.start - offset), end = Math.min(text.length, range.end - offset);
    if (end <= start) continue;
    if (start > cursor) parts.push({text:text.slice(cursor,start),changed:false});
    parts.push({text:text.slice(start,end),changed:true}); cursor=end;
  }
  if (cursor < text.length) parts.push({text:text.slice(cursor),changed:false});
  return parts;
}
