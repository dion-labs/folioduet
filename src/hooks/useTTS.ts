/**
 * useTTS.ts
 * 
 * A custom React hook (Milestone 2) that wraps our robust TTSEngine.
 * Manages reactive playback states (isPlaying, isPaused, activeBlockIndex, activeWordIndex),
 * handles smooth sentence/block transitions, and supports page-advancing events 
 * for "Auto-Page Turn" capability.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { marked, type Token, type Tokens } from 'marked';
import { TTSEngine, TextToken, TTSEngineConfig, tokenizeBlock } from './TTSEngine';

export { tokenizeBlock };
export type { TextToken };

export interface UseTTSProps {
  blocks: string[]; // Sequential paragraphs/lines on the current page
  pageIndex: number;
  onPageTurn?: () => void; // Triggered when the final block on the page is fully read
  onPositionUpdate?: (blockIndex: number, wordIndex: number) => void; // Sync callback for local/remote progression
  initialVoice?: SpeechSynthesisVoice | null;
  initialRate?: number;
  initialPitch?: number;
}

/**
 * Generates HTML with words wrapped in spans for granular highlighting.
 * Preserves exact spacing and punctuation in between.
 */
export function generateSpannedHTML(originalText: string, tokens: TextToken[]): string {
  let html = '';
  let lastIndex = 0;

  for (const token of tokens) {
    // Add any text between the last token and the current token
    if (token.startIndex > lastIndex) {
      const interstitial = originalText.slice(lastIndex, token.startIndex);
      html += `<span>${escapeHtml(interstitial)}</span>`;
    }
    // Add the token wrapped in a span
    html += `<span class="tts-word" data-word-idx="${token.elementIndex}">${escapeHtml(token.word)}</span>`;
    lastIndex = token.endIndex;
  }

  // Add any remaining text after the last token
  if (lastIndex < originalText.length) {
    const remaining = originalText.slice(lastIndex);
    html += `<span>${escapeHtml(remaining)}</span>`;
  }

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function useTTS({
  blocks,
  pageIndex,
  onPageTurn,
  onPositionUpdate,
  initialVoice = null,
  initialRate = 1.0,
  initialPitch = 1.0,
}: UseTTSProps) {
  const [activeBlockIndex, setActiveBlockIndex] = useState(-1);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTokens, setCurrentTokens] = useState<TextToken[]>([]);

  const engineRef = useRef<TTSEngine | null>(null);
  const autoPlayNextPageRef = useRef(false);

  // Keep callback refs stable to prevent utterance re-creation loops
  const onPageTurnRef = useRef(onPageTurn);
  const onPositionUpdateRef = useRef(onPositionUpdate);
  const blocksRef = useRef(blocks);

  useEffect(() => {
    onPageTurnRef.current = onPageTurn;
    onPositionUpdateRef.current = onPositionUpdate;
    blocksRef.current = blocks;
  }, [onPageTurn, onPositionUpdate, blocks]);

  // Handle word boundary dispatch
  const handleWordBoundary = useCallback((wordIdx: number, charIdx: number) => {
    console.log("🐝 [useTTS Hook] handleWordBoundary invoked. wordIdx:", wordIdx, "charIdx:", charIdx);
    setActiveWordIndex(wordIdx);
    if (onPositionUpdateRef.current && engineRef.current) {
      onPositionUpdateRef.current(engineRef.current.getBlockIndex(), wordIdx);
    }
  }, []);

  // Handle block completion transitions
  const handleBlockEnd = useCallback(() => {
    const currentBlockIdx = engineRef.current ? engineRef.current.getBlockIndex() : -1;
    const nextBlockIdx = currentBlockIdx + 1;
    console.log("🐝 [useTTS Hook] handleBlockEnd invoked. Completed block index:", currentBlockIdx, "Next expected block index:", nextBlockIdx, "Total blocks:", blocksRef.current.length);

    if (nextBlockIdx < blocksRef.current.length) {
      // Advance to next paragraph/block sequentially
      console.log("🐝 [useTTS Hook] Advancing to next block index:", nextBlockIdx);
      setActiveBlockIndex(nextBlockIdx);
      setActiveWordIndex(0);
      
      const engine = engineRef.current;
      if (engine) {
        engine.setBlock(nextBlockIdx, blocksRef.current[nextBlockIdx]);
        setCurrentTokens(engine.getTokens());
        engine.play(0);
      }
    } else {
      // Last paragraph on page read; trigger auto-page turn!
      console.log("🐝 [useTTS Hook] Last block completed. Triggering onPageTurn callback.");
      autoPlayNextPageRef.current = true;
      setIsPlaying(false);
      setIsPaused(false);
      setActiveBlockIndex(-1);
      setActiveWordIndex(-1);
      setCurrentTokens([]);
      
      if (onPageTurnRef.current) {
        onPageTurnRef.current();
      }
    }
  }, []);

  const handlePlaybackError = useCallback((err: any) => {
    console.error("🐝 [useTTS Hook] handlePlaybackError triggered:", err);
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  // Initialize and tear down the engine once on mount
  useEffect(() => {
    console.log("🐝 [useTTS Hook] Creating new TTSEngine instance on mount.");
    const engine = new TTSEngine({
      voice: initialVoice,
      rate: initialRate,
      pitch: initialPitch,
      onWordBoundary: handleWordBoundary,
      onEnd: handleBlockEnd,
      onError: handlePlaybackError,
      onPause: () => {
        console.log("🐝 [useTTS Hook] Engine onPause callback triggered.");
        setIsPaused(true);
      },
      onResume: () => {
        console.log("🐝 [useTTS Hook] Engine onResume callback triggered.");
        setIsPaused(false);
      },
      onStop: () => {
        console.log("🐝 [useTTS Hook] Engine onStop callback triggered.");
        setIsPlaying(false);
        setIsPaused(false);
      },
    });

    engineRef.current = engine;

    return () => {
      console.log("🐝 [useTTS Hook] Tearing down TTSEngine instance on unmount.");
      engine.stop();
    };
  }, [handleWordBoundary, handleBlockEnd, handlePlaybackError]);

  // =========================================================================
  // Playback Control Commands
  // =========================================================================

  const play = useCallback((blockIdx: number, wordIdx = 0) => {
    console.log("🐝 [useTTS Hook] play() command called. blockIdx:", blockIdx, "wordIdx:", wordIdx);
    if (!engineRef.current || blockIdx < 0 || blockIdx >= blocksRef.current.length) {
      console.log("🐝 [useTTS Hook] play() skipped. Engine initialized:", !!engineRef.current, "block index bounds valid:", blockIdx >= 0 && blockIdx < blocksRef.current.length);
      return;
    }

    setActiveBlockIndex(blockIdx);
    setIsPlaying(true);
    setIsPaused(false);

    const engine = engineRef.current;
    engine.setBlock(blockIdx, blocksRef.current[blockIdx]);
    setCurrentTokens(engine.getTokens());
    engine.play(wordIdx);
  }, []);

  const pause = useCallback(() => {
    console.log("🐝 [useTTS Hook] pause() command called.");
    engineRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    console.log("🐝 [useTTS Hook] resume() command called.");
    engineRef.current?.resume();
  }, []);

  const stop = useCallback(() => {
    console.log("🐝 [useTTS Hook] stop() command called.");
    autoPlayNextPageRef.current = false;
    engineRef.current?.stop();
  }, []);

  const updateConfig = useCallback((config: Partial<Omit<TTSEngineConfig, 'onWordBoundary' | 'onEnd' | 'onError'>>) => {
    console.log("🐝 [useTTS Hook] updateConfig() command called. Keys:", Object.keys(config));
    engineRef.current?.updateConfig(config);
  }, []);

  // Sync engine configuration when voice, rate, or pitch changes
  useEffect(() => {
    if (engineRef.current) {
      console.log("🐝 [useTTS Hook] Syncing config to engine. Voice:", initialVoice?.name, "Rate:", initialRate);
      engineRef.current.updateConfig({
        voice: initialVoice,
        rate: initialRate,
        pitch: initialPitch,
      });
    }
  }, [initialVoice, initialRate, initialPitch]);

  // Reset indices on page changes
  useEffect(() => {
    console.log("🐝 [useTTS Hook] Page index changed to:", pageIndex);
    if (isPlaying) {
      console.log("🐝 [useTTS Hook] Stop playing current page prior to changing page.");
      engineRef.current?.stop();
      setIsPlaying(false);
      setIsPaused(false);
    }
    setActiveBlockIndex(-1);
    setActiveWordIndex(-1);
    setCurrentTokens([]);
  }, [pageIndex]);

  // Automatically play if autoPlayNextPageRef is true and blocks are loaded for next page
  useEffect(() => {
    if (autoPlayNextPageRef.current && blocks && blocks.length > 0) {
      console.log("🐝 [useTTS Hook] Blocks loaded for pageIndex", pageIndex, ". Triggering auto-play on next page!");
      autoPlayNextPageRef.current = false;
      
      // Delay play slightly to allow state to settle and ensure clean transitions
      const timer = setTimeout(() => {
        play(0, 0);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [blocks, pageIndex, play]);

  return {
    activeBlockIndex,
    activeWordIndex,
    isPlaying,
    isPaused,
    currentTokens,
    play,
    pause,
    resume,
    stop,
    updateConfig,
  };
}

export interface MarkdownBlock {
  type: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'li' | 'blockquote' | 'code' | 'table-row';
  text: string;           // Flattened rendered text spoken by TTS
  raw: string;            // Original untouched block markdown
  inlineRuns: MarkdownInlineRun[]; // Formatting-aware representation for the reader
  tokens: TextToken[];    // Word tokens for this block
  globalWordOffset: number; // Sum of tokens in all preceding blocks on this page
  listKind?: 'ordered' | 'unordered';
  listIndex?: number;
  listDepth?: number;
  tableCells?: MarkdownInlineRun[][];
  tableHeader?: boolean;
}

export interface MarkdownInlineRun {
  text: string;
  strong?: boolean;
  emphasis?: boolean;
  code?: boolean;
  strikethrough?: boolean;
  href?: string;
}

function decodeMarkdownEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#(?:39|x27);/gi, "'")
    .replace(/&#(\d+);/g, (_, value: string) => {
      const codePoint = Number.parseInt(value, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&#x([\da-f]+);/gi, (_, value: string) => {
      const codePoint = Number.parseInt(value, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
    });
}

function safeMarkdownHref(value: string): string | undefined {
  const href = value.trim();
  return /^(?:https?:\/\/|mailto:)/i.test(href) ? href : undefined;
}

function mergeInlineRuns(runs: MarkdownInlineRun[]): MarkdownInlineRun[] {
  const merged: MarkdownInlineRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = merged[merged.length - 1];
    if (
      previous
      && previous.strong === run.strong
      && previous.emphasis === run.emphasis
      && previous.code === run.code
      && previous.strikethrough === run.strikethrough
      && previous.href === run.href
    ) {
      previous.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function applyInlineMark(
  runs: MarkdownInlineRun[],
  mark: Omit<MarkdownInlineRun, 'text'>,
): MarkdownInlineRun[] {
  return runs.map((run) => ({ ...run, ...mark }));
}

function stripHtmlTags(html: string): string {
  return decodeMarkdownEntities(html
    .replace(/<(?:script|style)[^>]*>[\s\S]*?<\/(?:script|style)>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function normalizeInlineRuns(runs: MarkdownInlineRun[]): MarkdownInlineRun[] {
  const normalized = mergeInlineRuns(runs.map((run) => ({
    ...run,
    text: decodeMarkdownEntities(run.text).replace(/\s+/g, ' '),
  })));
  if (normalized.length === 0) return [];
  normalized[0].text = normalized[0].text.replace(/^\s+/, '');
  normalized[normalized.length - 1].text = normalized[normalized.length - 1].text.replace(/\s+$/, '');
  return mergeInlineRuns(normalized);
}

function tokenTextRuns(
  tokens: Token[] | undefined,
  mark: Omit<MarkdownInlineRun, 'text'> = {},
): MarkdownInlineRun[] {
  if (!tokens) return [];
  const runs: MarkdownInlineRun[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'hr':
      case 'def':
      case 'checkbox':
        break;
      case 'space':
        runs.push({ text: ' ', ...mark });
        break;
      case 'br':
        runs.push({ text: ' ', ...mark });
        break;
      case 'escape':
        runs.push({ text: token.text, ...mark });
        break;
      case 'codespan':
        runs.push({ text: token.text, ...mark, code: true });
        break;
      case 'code':
        runs.push({ text: token.text, ...mark, code: true });
        break;
      case 'strong':
        runs.push(...tokenTextRuns(token.tokens, { ...mark, strong: true }));
        break;
      case 'em':
        runs.push(...tokenTextRuns(token.tokens, { ...mark, emphasis: true }));
        break;
      case 'del':
        runs.push(...tokenTextRuns(token.tokens, { ...mark, strikethrough: true }));
        break;
      case 'link': {
        // Autolinks are destinations, not prose. Named links retain their human label.
        if (token.text.trim() === token.href.trim()) break;
        runs.push(...tokenTextRuns(token.tokens, {
          ...mark,
          href: safeMarkdownHref(token.href),
        }));
        break;
      }
      case 'image':
        if (token.text.trim()) {
          runs.push(...applyInlineMark(
            token.tokens?.length ? tokenTextRuns(token.tokens) : [{ text: token.text }],
            { ...mark, emphasis: true },
          ));
        }
        break;
      case 'html': {
        const text = stripHtmlTags(token.text);
        if (text.trim()) runs.push({ text, ...mark });
        break;
      }
      case 'table': {
        const cells = [token.header, ...token.rows].flat();
        cells.forEach((cell, index) => {
          if (index > 0) runs.push({ text: ' ', ...mark });
          runs.push(...tokenTextRuns(cell.tokens, mark));
        });
        break;
      }
      case 'list':
        (token as Tokens.List).items.forEach((item, index) => {
          if (index > 0) runs.push({ text: ' ', ...mark });
          runs.push(...tokenTextRuns(item.tokens, mark));
        });
        break;
      default: {
        const childTokens = 'tokens' in token ? token.tokens : undefined;
        if (childTokens?.length) {
          runs.push(...tokenTextRuns(childTokens, mark));
        } else if ('text' in token && typeof token.text === 'string') {
          runs.push({ text: token.text, ...mark });
        }
      }
    }
  }
  return normalizeInlineRuns(runs);
}

/** Parse CommonMark/GFM once: formatting stays in runs, while syntax never reaches TTS. */
export function markdownToInlineRuns(markdown: string): MarkdownInlineRun[] {
  if (!markdown.trim()) return [];
  return tokenTextRuns(marked.lexer(markdown, { gfm: true }));
}

export function markdownToSpeakableText(markdown: string): string {
  return markdownToInlineRuns(markdown).map((run) => run.text).join('').trim();
}

export function parsePageMarkdown(markdown: string): MarkdownBlock[] {
  if (!markdown) return [];
  const blocks: Omit<MarkdownBlock, 'tokens' | 'globalWordOffset'>[] = [];

  const pushBlock = (
    type: MarkdownBlock['type'],
    raw: string,
    inlineRuns: MarkdownInlineRun[],
    extras: Partial<Omit<MarkdownBlock, 'type' | 'raw' | 'text' | 'inlineRuns' | 'tokens' | 'globalWordOffset'>> = {},
  ) => {
    const runs = normalizeInlineRuns(inlineRuns);
    const text = runs.map((run) => run.text).join('').trim();
    if (!text) return;
    blocks.push({ type, raw: raw.trim(), inlineRuns: runs, text, ...extras });
  };

  const visitList = (token: Tokens.List, depth: number) => {
    token.items.forEach((item, itemOffset) => {
      const ownTokens = item.tokens.filter((child) => child.type !== 'list');
      pushBlock('li', item.raw, tokenTextRuns(ownTokens), {
        listKind: token.ordered ? 'ordered' : 'unordered',
        listIndex: token.ordered ? Number(token.start || 1) + itemOffset : undefined,
        listDepth: depth,
      });
      item.tokens.forEach((child) => {
        if (child.type === 'list') visitList(child as Tokens.List, depth + 1);
      });
    });
  };

  for (const token of marked.lexer(markdown.replace(/\r\n?/g, '\n'), { gfm: true })) {
    switch (token.type) {
      case 'heading':
        pushBlock(`h${Math.min(6, Math.max(1, token.depth))}` as MarkdownBlock['type'], token.raw, tokenTextRuns(token.tokens));
        break;
      case 'paragraph':
      case 'text':
        pushBlock('p', token.raw, tokenTextRuns(token.tokens ?? [token]));
        break;
      case 'blockquote':
        pushBlock('blockquote', token.raw, tokenTextRuns(token.tokens));
        break;
      case 'code':
        pushBlock('code', token.raw, [{ text: token.text, code: true }]);
        break;
      case 'list':
        visitList(token as Tokens.List, 0);
        break;
      case 'table': {
        const table = token as Tokens.Table;
        const rows = [table.header, ...table.rows];
        rows.forEach((cells, rowIndex) => {
          const tableCells = cells.map((cell) => tokenTextRuns(cell.tokens));
          const joined: MarkdownInlineRun[] = [];
          tableCells.forEach((cellRuns, cellIndex) => {
            if (cellIndex > 0) joined.push({ text: ' ' });
            joined.push(...cellRuns);
          });
          pushBlock('table-row', rowIndex === 0 ? token.raw : '', joined, {
            tableCells,
            tableHeader: rowIndex === 0,
          });
        });
        break;
      }
      case 'html': {
        const text = stripHtmlTags(token.text);
        if (text.trim()) pushBlock('p', token.raw, [{ text }]);
        break;
      }
      default:
        break;
    }
  }

  let currentOffset = 0;
  const decoratedBlocks: MarkdownBlock[] = [];

  for (const block of blocks) {
    const tokens = tokenizeBlock(block.text);
    decoratedBlocks.push({
      ...block,
      tokens,
      globalWordOffset: currentOffset,
    });
    currentOffset += tokens.length;
  }

  return decoratedBlocks;
}
