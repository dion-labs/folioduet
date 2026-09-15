export type WrapHyphenationStats = {
  candidates: number;
  joined: number;
  retained: number;
  skipped: number;
};

const WRAPPED_WORD = /([\p{L}]{2,})-([ \t]+)([\p{Ll}]{2,})/gu;
const COMPACT_WORD = /[\p{L}]{2,}/gu;
const HYPHENATED_WORD = /([\p{L}]{2,})-([\p{Ll}]{2,})/gu;

type TextRange = { start: number; end: number };

function collectMatches(line: string, pattern: RegExp): TextRange[] {
  return [...line.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function protectedInlineRanges(line: string): TextRange[] {
  return [
    ...collectMatches(line, /(`+).*?\1/g),
    ...collectMatches(line, /\]\([^\n)]*\)/g),
    ...collectMatches(line, /(?:https?:\/\/|mailto:)[^\s<]+/gi),
    ...collectMatches(line, /<[^>\n]*>/g),
  ];
}

function overlapsProtectedRange(start: number, end: number, ranges: TextRange[]): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function incrementCount(counts: Map<string, number>, value: string): void {
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

type WrapEvidence = {
  wordCounts: Map<string, number>;
  hyphenatedCounts: Map<string, number>;
};

/** Scan once per document, not once per source page. */
function collectWrapEvidence(markdown: string): WrapEvidence {
  const wordCounts = new Map<string, number>();
  const hyphenatedCounts = new Map<string, number>();
  for (const match of markdown.matchAll(COMPACT_WORD)) {
    incrementCount(wordCounts, match[0].toLowerCase());
  }
  for (const match of markdown.matchAll(HYPHENATED_WORD)) {
    incrementCount(hyphenatedCounts, `${match[1]}-${match[2]}`.toLowerCase());
  }
  return { wordCounts, hyphenatedCounts };
}

/**
 * Repair fixed-layout `archi- tecture` artifacts without guessing that
 * every hyphen is disposable. Existing joined words provide strong evidence for
 * `architecture`; otherwise spacing is repaired while a possible compound keeps
 * its hyphen (`long- term` -> `long-term`). Markdown code, URLs, and tables stay
 * byte-for-byte unchanged.
 */
export function repairWrapHyphenation(
  markdown: string,
  evidence: WrapEvidence = collectWrapEvidence(markdown),
): { markdown: string; stats: WrapHyphenationStats } {
  const { wordCounts, hyphenatedCounts } = evidence;
  const stats: WrapHyphenationStats = {
    candidates: 0,
    joined: 0,
    retained: 0,
    skipped: 0,
  };
  let fenceMarker: '`' | '~' | null = null;
  let fenceLength = 0;

  const lines = markdown.split('\n').map((line) => {
    const candidates = [...line.matchAll(WRAPPED_WORD)];
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMarker) {
      stats.candidates += candidates.length;
      stats.skipped += candidates.length;
      if (fence && fence[1][0] === fenceMarker && fence[1].length >= fenceLength) {
        fenceMarker = null;
        fenceLength = 0;
      }
      return line;
    }
    if (fence) {
      fenceMarker = fence[1][0] as '`' | '~';
      fenceLength = fence[1].length;
      return line;
    }

    if (candidates.length === 0) return line;
    stats.candidates += candidates.length;

    const blockProtected = /^(?: {4}|\t)/.test(line)
      || /^\s{0,3}\[[^\]]+\]:/.test(line)
      || /^\s*\|.*\|\s*$/.test(line);
    if (blockProtected) {
      stats.skipped += candidates.length;
      return line;
    }

    const protectedRanges = protectedInlineRanges(line);
    return line.replace(
      WRAPPED_WORD,
      (match, left: string, _spacing: string, right: string, offset: number) => {
        if (overlapsProtectedRange(offset, offset + match.length, protectedRanges)) {
          stats.skipped += 1;
          return match;
        }

        const joinedKey = `${left}${right}`.toLowerCase();
        const hyphenatedKey = `${left}-${right}`.toLowerCase();
        const joinedSeen = (wordCounts.get(joinedKey) ?? 0) > 0;
        const hyphenatedSeen = (hyphenatedCounts.get(hyphenatedKey) ?? 0) > 0;

        if (joinedSeen && !hyphenatedSeen) {
          stats.joined += 1;
          return `${left}${right}`;
        }

        stats.retained += 1;
        return `${left}-${right}`;
      },
    );
  });

  return { markdown: lines.join('\n'), stats };
}

/**
 * Common post-extraction contract for PDF engines, Markdown archives, and synced
 * source pages. Keep source boundaries; use the whole document as word evidence.
 * Safe to run again when persisted extraction is opened on another device.
 */
export function normalizeExtractedMarkdownPages(pages: string[]): string[] {
  const normalized = pages.map((page) => page.replace(/\r\n?/g, '\n'));
  const evidence = collectWrapEvidence(normalized.join('\n\n'));
  return normalized.map((page) => repairWrapHyphenation(page, evidence).markdown
    .replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, ''))
    .filter((page) => page.trim().length > 0)
    .map((page) => `${page}\n`);
}
