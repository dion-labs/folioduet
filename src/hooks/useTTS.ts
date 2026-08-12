/**
 * useTTS.ts
 * 
 * A custom React hook (Milestone 2) that wraps our robust TTSEngine.
 * Manages reactive playback states (isPlaying, isPaused, activeBlockIndex, activeWordIndex),
 * handles smooth sentence/block transitions, and supports page-advancing events 
 * for "Auto-Page Turn" capability.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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
  type: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'li' | 'blockquote' | 'code' | 'hr';
  text: string;           // Flattened rendered text spoken by TTS
  raw: string;            // Original untouched block markdown
  inlineRuns: MarkdownInlineRun[]; // Formatting-aware representation for the reader
  tokens: TextToken[];    // Word tokens for this block
  globalWordOffset: number; // Sum of tokens in all preceding blocks on this page
}

export interface MarkdownInlineRun {
  text: string;
  strong?: boolean;
  emphasis?: boolean;
  code?: boolean;
  strikethrough?: boolean;
  href?: string;
}

const MARKDOWN_TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function decodeMarkdownEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'");
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

function parseInlineMarkdown(markdown: string): MarkdownInlineRun[] {
  const runs: MarkdownInlineRun[] = [];
  const pattern = /!\[([^\]]*)\]\(([^)]*)\)|\[([^\]]+)\]\(([^)]*)\)|(`+)([\s\S]*?)\5|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\n]+?)\*|_([^_\n]+?)_/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    if (match.index > cursor) {
      runs.push({ text: decodeMarkdownEntities(markdown.slice(cursor, match.index)) });
    }

    if (match[1] !== undefined) {
      // PDF image destinations are usually unavailable after extraction; retain useful alt text.
      runs.push(...applyInlineMark(parseInlineMarkdown(match[1]), { emphasis: true }));
    } else if (match[3] !== undefined) {
      runs.push(...applyInlineMark(parseInlineMarkdown(match[3]), {
        href: safeMarkdownHref(match[4]),
      }));
    } else if (match[6] !== undefined) {
      runs.push({ text: decodeMarkdownEntities(match[6]), code: true });
    } else if (match[7] !== undefined || match[8] !== undefined) {
      runs.push(...applyInlineMark(parseInlineMarkdown(match[7] ?? match[8]), { strong: true }));
    } else if (match[9] !== undefined) {
      runs.push(...applyInlineMark(parseInlineMarkdown(match[9]), { strikethrough: true }));
    } else {
      runs.push(...applyInlineMark(parseInlineMarkdown(match[10] ?? match[11]), { emphasis: true }));
    }
    cursor = pattern.lastIndex;
  }

  if (cursor < markdown.length) {
    runs.push({ text: decodeMarkdownEntities(markdown.slice(cursor)) });
  }
  return mergeInlineRuns(runs);
}

/** Parse Markdown once: formatting stays in runs, while their text is safe for TTS. */
export function markdownToInlineRuns(markdown: string): MarkdownInlineRun[] {
  const normalized = markdown
    .split('\n')
    .filter((line) => !MARKDOWN_TABLE_RULE.test(line) && !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line))
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[^\n]*\n?/g, ' ')
    .replace(/~~~[^\n]*\n?/g, ' ')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, ' ')
    .replace(/<(?:(?:https?:\/\/|mailto:)[^>]+)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\\[()[\]]/g, ' ')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, '')
    .replace(/\\([\\`*_[\]{}()#+.!|>~-])/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return parseInlineMarkdown(normalized);
}

export function markdownToSpeakableText(markdown: string): string {
  return markdownToInlineRuns(markdown).map((run) => run.text).join('').trim();
}

export function parsePageMarkdown(markdown: string): MarkdownBlock[] {
  if (!markdown) return [];

  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: Omit<MarkdownBlock, 'tokens' | 'globalWordOffset'>[] = [];

  let currentBlockType: MarkdownBlock['type'] | null = null;
  let currentLines: string[] = [];

  const flushCurrentBlock = () => {
    if (currentLines.length === 0) return;
    const raw = currentLines.join('\n').trim();
    if (!raw) {
      currentLines = [];
      return;
    }

    let type = currentBlockType || 'p';
    let text = raw;

    if (type === 'h1' && text.startsWith('# ')) text = text.slice(2);
    else if (type === 'h2' && text.startsWith('## ')) text = text.slice(3);
    else if (type === 'h3' && text.startsWith('### ')) text = text.slice(4);
    else if (type === 'h4' && text.startsWith('#### ')) text = text.slice(5);
    else if (type === 'h5' && text.startsWith('##### ')) text = text.slice(6);
    else if (type === 'h6' && text.startsWith('###### ')) text = text.slice(7);
    else if (type === 'blockquote') {
      text = text.replace(/^>\s*/gm, '');
    } else if (type === 'li') {
      if (text.startsWith('- ')) text = text.slice(2);
      else if (text.startsWith('* ')) text = text.slice(2);
    }

    const inlineRuns = markdownToInlineRuns(text);
    text = inlineRuns.map((run) => run.text).join('').trim();
    if (!text) {
      currentLines = [];
      currentBlockType = null;
      return;
    }

    blocks.push({
      type,
      text,
      raw,
      inlineRuns,
    });

    currentLines = [];
    currentBlockType = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flushCurrentBlock();
      continue;
    }

    let lineType: MarkdownBlock['type'] = 'p';
    if (trimmed.startsWith('# ')) lineType = 'h1';
    else if (trimmed.startsWith('## ')) lineType = 'h2';
    else if (trimmed.startsWith('### ')) lineType = 'h3';
    else if (trimmed.startsWith('#### ')) lineType = 'h4';
    else if (trimmed.startsWith('##### ')) lineType = 'h5';
    else if (trimmed.startsWith('###### ')) lineType = 'h6';
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) lineType = 'li';
    else if (trimmed.startsWith('> ')) lineType = 'blockquote';

    if (lineType !== 'p') {
      flushCurrentBlock();
      currentBlockType = lineType;
      currentLines.push(line);
      if (lineType.startsWith('h')) {
        flushCurrentBlock();
      }
    } else {
      if (currentBlockType && currentBlockType !== 'p' && currentBlockType !== 'blockquote' && currentBlockType !== 'li') {
        flushCurrentBlock();
      }
      if (!currentBlockType) {
        currentBlockType = 'p';
      }
      currentLines.push(line);
    }
  }

  flushCurrentBlock();

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
