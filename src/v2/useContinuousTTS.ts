import { useCallback, useEffect, useRef, useState } from 'react';
import { TTSEngine, type TTSEngineConfig } from '../hooks/TTSEngine';
import {
  buildTtsLookAhead,
  findSpeakableStreamBlock,
  resolveTtsStreamPosition,
  type TtsStreamBlock,
  type TtsStreamPosition,
} from './ttsStream';

type PlaybackState = 'idle' | 'buffering' | 'playing' | 'paused';

interface UseContinuousTTSOptions {
  streamBlocks: TtsStreamBlock[];
  pageStarts: number[];
  bufferAhead: number;
  config: Partial<TTSEngineConfig>;
  /** UI notification only: playback has already advanced in the stream. */
  onPageChange: (pageIndex: number) => void;
  onPositionUpdate: (position: TtsStreamPosition) => void;
}

export function useContinuousTTS({
  streamBlocks,
  pageStarts,
  bufferAhead,
  config,
  onPageChange,
  onPositionUpdate,
}: UseContinuousTTSOptions) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [activeStreamIndex, setActiveStreamIndex] = useState(-1);
  const [activeBlockIndex, setActiveBlockIndex] = useState(-1);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [lastError, setLastError] = useState<string | null>(null);

  const engineRef = useRef<TTSEngine | null>(null);
  const streamBlocksRef = useRef(streamBlocks);
  const pageStartsRef = useRef(pageStarts);
  const activeStreamIndexRef = useRef(-1);
  const playbackPageRef = useRef<number | null>(null);
  const onPageChangeRef = useRef(onPageChange);
  const onPositionUpdateRef = useRef(onPositionUpdate);

  const applyPosition = useCallback((streamIndex: number, wordIndex: number) => {
    const position = resolveTtsStreamPosition(pageStartsRef.current, streamIndex, wordIndex);
    activeStreamIndexRef.current = position.streamIndex;
    setActiveStreamIndex(position.streamIndex);
    setActiveBlockIndex(position.blockIndex);
    setActiveWordIndex(position.wordIndex);

    if (playbackPageRef.current !== position.pageIndex) {
      playbackPageRef.current = position.pageIndex;
      onPageChangeRef.current(position.pageIndex);
    }
    return position;
  }, []);

  const preloadLookAhead = useCallback((afterStreamIndex: number) => {
    const count = Math.max(1, Math.floor(bufferAhead));
    engineRef.current?.preloadBlocks(buildTtsLookAhead(
      streamBlocksRef.current,
      afterStreamIndex,
      count,
    ), count);
  }, [bufferAhead]);

  const playStreamBlock = useCallback((requestedStreamIndex: number, requestedWordIndex = 0) => {
    const engine = engineRef.current;
    if (!engine) return false;

    const streamIndex = findSpeakableStreamBlock(
      streamBlocksRef.current,
      requestedStreamIndex,
    );
    if (streamIndex === -1) return false;

    const wordIndex = streamIndex === requestedStreamIndex
      ? Math.max(0, requestedWordIndex)
      : 0;
    const block = streamBlocksRef.current[streamIndex];
    setLastError(null);
    setPlaybackState('buffering');
    applyPosition(streamIndex, wordIndex);
    engine.setBlock(streamIndex, block.text);
    engine.play(wordIndex);
    preloadLookAhead(streamIndex);
    setPlaybackState('playing');
    return true;
  }, [applyPosition, preloadLookAhead]);

  const handleBlockEnd = useCallback(() => {
    const nextStreamIndex = findSpeakableStreamBlock(
      streamBlocksRef.current,
      activeStreamIndexRef.current + 1,
    );
    if (nextStreamIndex !== -1) {
      // The engine advances immediately. React may paint a different page in
      // response, but that page change is not part of the playback handshake.
      playStreamBlock(nextStreamIndex, 0);
      return;
    }

    activeStreamIndexRef.current = -1;
    playbackPageRef.current = null;
    setPlaybackState('idle');
    setActiveStreamIndex(-1);
    setActiveBlockIndex(-1);
    setActiveWordIndex(-1);
  }, [playStreamBlock]);

  useEffect(() => {
    streamBlocksRef.current = streamBlocks;
    pageStartsRef.current = pageStarts;
    onPageChangeRef.current = onPageChange;
    onPositionUpdateRef.current = onPositionUpdate;

    if (activeStreamIndexRef.current >= 0) {
      const position = applyPosition(activeStreamIndexRef.current, activeWordIndex);
      playbackPageRef.current = position.pageIndex;
    }
  }, [
    activeWordIndex,
    applyPosition,
    onPageChange,
    onPositionUpdate,
    pageStarts,
    streamBlocks,
  ]);

  useEffect(() => {
    const engine = new TTSEngine({
      ...config,
      onWordBoundary: (wordIndex) => {
        const streamIndex = activeStreamIndexRef.current;
        if (streamIndex < 0) return;
        const position = applyPosition(streamIndex, wordIndex);
        onPositionUpdateRef.current(position);
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
  }, [applyPosition, handleBlockEnd]);

  useEffect(() => {
    engineRef.current?.updateConfig(config);
    preloadLookAhead(activeStreamIndexRef.current);
  }, [config, preloadLookAhead, streamBlocks]);

  const play = useCallback((streamIndex = 0, wordIndex = 0) => {
    playStreamBlock(streamIndex, wordIndex);
  }, [playStreamBlock]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const stop = useCallback(() => {
    activeStreamIndexRef.current = -1;
    playbackPageRef.current = null;
    engineRef.current?.stop();
    setPlaybackState('idle');
    setActiveStreamIndex(-1);
    setActiveBlockIndex(-1);
    setActiveWordIndex(-1);
  }, []);

  const primeAudioCache = useCallback((
    clips: Array<{
      text: string;
      provider: string;
      voiceId: string;
      audioContent: string;
    }>,
  ) => {
    engineRef.current?.primeAudioCache(clips);
  }, []);

  return {
    playbackState,
    isPlaying: playbackState === 'playing' || playbackState === 'paused' || playbackState === 'buffering',
    isPaused: playbackState === 'paused',
    activeStreamIndex,
    activeBlockIndex,
    activeWordIndex,
    lastError,
    play,
    pause,
    resume,
    stop,
    primeAudioCache,
  };
}
