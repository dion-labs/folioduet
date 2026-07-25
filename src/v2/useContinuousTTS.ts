import { useCallback, useEffect, useRef, useState } from 'react';
import { TTSEngine, type TTSEngineConfig } from '../hooks/TTSEngine';

type PlaybackState = 'idle' | 'buffering' | 'playing' | 'paused';

interface UseContinuousTTSOptions {
  blocks: string[];
  blocksPageIndex: number;
  pageIndex: number;
  totalPages: number;
  config: Partial<TTSEngineConfig>;
  onAutoAdvance: (nextPageIndex: number) => void;
  onPositionUpdate: (blockIndex: number, wordIndex: number) => void;
}

function findSpeakableBlock(blocks: string[], startIndex: number): number {
  for (let index = Math.max(0, startIndex); index < blocks.length; index += 1) {
    if (blocks[index]?.trim()) return index;
  }
  return -1;
}

export function useContinuousTTS({
  blocks,
  blocksPageIndex,
  pageIndex,
  totalPages,
  config,
  onAutoAdvance,
  onPositionUpdate,
}: UseContinuousTTSOptions) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [activeBlockIndex, setActiveBlockIndex] = useState(-1);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [lastError, setLastError] = useState<string | null>(null);

  const engineRef = useRef<TTSEngine | null>(null);
  const blocksRef = useRef(blocks);
  const pageIndexRef = useRef(pageIndex);
  const totalPagesRef = useRef(totalPages);
  const pendingAutoPageRef = useRef<number | null>(null);
  const onAutoAdvanceRef = useRef(onAutoAdvance);
  const onPositionUpdateRef = useRef(onPositionUpdate);

  useEffect(() => {
    blocksRef.current = blocks;
    pageIndexRef.current = pageIndex;
    totalPagesRef.current = totalPages;
    onAutoAdvanceRef.current = onAutoAdvance;
    onPositionUpdateRef.current = onPositionUpdate;
  }, [blocks, pageIndex, totalPages, onAutoAdvance, onPositionUpdate]);

  const playBlock = useCallback((requestedBlockIndex: number, requestedWordIndex = 0) => {
    const engine = engineRef.current;
    if (!engine) return false;

    const blockIndex = findSpeakableBlock(blocksRef.current, requestedBlockIndex);
    if (blockIndex === -1) return false;

    const wordIndex = blockIndex === requestedBlockIndex ? Math.max(0, requestedWordIndex) : 0;
    setLastError(null);
    setActiveBlockIndex(blockIndex);
    setActiveWordIndex(wordIndex);
    setPlaybackState('buffering');
    engine.setBlock(blockIndex, blocksRef.current[blockIndex]);
    engine.play(wordIndex);
    setPlaybackState('playing');
    return true;
  }, []);

  const handleBlockEnd = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const nextBlockIndex = findSpeakableBlock(blocksRef.current, engine.getBlockIndex() + 1);
    if (nextBlockIndex !== -1) {
      playBlock(nextBlockIndex, 0);
      return;
    }

    const nextPageIndex = pageIndexRef.current + 1;
    if (nextPageIndex < totalPagesRef.current) {
      pendingAutoPageRef.current = nextPageIndex;
      setActiveBlockIndex(-1);
      setActiveWordIndex(-1);
      setPlaybackState('buffering');
      onAutoAdvanceRef.current(nextPageIndex);
      return;
    }

    pendingAutoPageRef.current = null;
    setPlaybackState('idle');
    setActiveBlockIndex(-1);
    setActiveWordIndex(-1);
  }, [playBlock]);

  useEffect(() => {
    const engine = new TTSEngine({
      ...config,
      onWordBoundary: (wordIndex) => {
        setActiveWordIndex(wordIndex);
        const blockIndex = engineRef.current?.getBlockIndex() ?? -1;
        if (blockIndex >= 0) {
          onPositionUpdateRef.current(blockIndex, wordIndex);
        }
      },
      onEnd: handleBlockEnd,
      onPause: () => setPlaybackState('paused'),
      onResume: () => setPlaybackState('playing'),
      onStop: () => setPlaybackState('idle'),
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Audio playback failed.';
        setLastError(message);
      },
    });

    engineRef.current = engine;
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [handleBlockEnd]);

  useEffect(() => {
    engineRef.current?.updateConfig(config);
  }, [config]);

  useEffect(() => {
    const pendingPage = pendingAutoPageRef.current;
    if (
      pendingPage === null ||
      pageIndex !== pendingPage ||
      blocksPageIndex !== pendingPage ||
      blocks.length === 0
    ) {
      return;
    }

    pendingAutoPageRef.current = null;
    const timer = window.setTimeout(() => {
      if (!playBlock(0, 0)) {
        setPlaybackState('idle');
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [blocks, blocksPageIndex, pageIndex, playBlock]);

  const play = useCallback((blockIndex = 0, wordIndex = 0) => {
    pendingAutoPageRef.current = null;
    playBlock(blockIndex, wordIndex);
  }, [playBlock]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const stop = useCallback(() => {
    pendingAutoPageRef.current = null;
    engineRef.current?.stop();
    setPlaybackState('idle');
  }, []);

  return {
    playbackState,
    isPlaying: playbackState === 'playing' || playbackState === 'paused' || playbackState === 'buffering',
    isPaused: playbackState === 'paused',
    activeBlockIndex,
    activeWordIndex,
    lastError,
    play,
    pause,
    resume,
    stop,
  };
}

