import { describe, it, expect } from 'vitest';
import { compareMarkdown } from './compare';
describe('reference comparison', () => {
  it('detects reordered words even when counts agree', () => {
    expect(compareMarkdown('alpha beta gamma', 'gamma beta alpha').wordEdits).toBe(2);
  });
  it('keeps structural loss visible even with identical prose', () => {
    const r = compareMarkdown('# A heading\n\nA paragraph.\n\nAnother paragraph.', 'A heading\n\nA paragraph. Another paragraph.');
    expect(r.orderedWordAccuracy).toBe(1);
    expect(r.referenceParagraphs).toBe(2);
    expect(r.actualHeadings).toEqual([]);
  });
  it('reports missing words and handles empty references', () => {
    expect(compareMarkdown('one two three', 'one three').wordEdits).toBe(1);
    expect(compareMarkdown('', 'extra').orderedWordAccuracy).toBe(0);
    expect(compareMarkdown('', '').orderedWordAccuracy).toBe(1);
  });
});
