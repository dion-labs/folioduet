/**
 * TTSEngine.ts
 * 
 * A high-performance, production-ready TypeScript implementation of the Bimodal
 * TTS Playback & Tokenization Engine (Milestone 2). Supports word-level token
 * mapping, character boundary alignment, state preservation across slice-offsets,
 * robust pause/resume safety, and timer-based simulation fallbacks for voices/browsers
 * that lack native onboundary events.
 */

export interface TextToken {
  word: string;
  startIndex: number;
  endIndex: number;
  elementIndex: number; // 0-based word index within the block
}

export interface InworldTextChunk {
  text: string;
  startCharOffset: number;
  endCharOffset: number;
}

const INWORLD_TEXT_CHUNK_LENGTH = 1900;

/**
 * Splits text below Inworld's 2,000-character request limit while preserving an
 * exact mapping back to the original block. Sentence and whitespace boundaries
 * are preferred, with a hard split reserved for unusually long unbroken text.
 */
export function splitTextForInworld(
  text: string,
  maxLength = INWORLD_TEXT_CHUNK_LENGTH,
): InworldTextChunk[] {
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new Error('Inworld chunk length must be a positive integer.');
  }

  const chunks: InworldTextChunk[] = [];
  let startCharOffset = 0;

  while (startCharOffset < text.length) {
    const remainingLength = text.length - startCharOffset;
    let endCharOffset = Math.min(text.length, startCharOffset + maxLength);

    if (remainingLength > maxLength) {
      const window = text.slice(startCharOffset, endCharOffset);
      const minimumPreferredBreak = Math.floor(maxLength * 0.5);
      let preferredBreak = -1;

      const sentenceBoundary = /[.!?;:][”’"'）)\]}]*\s+/gu;
      for (const match of window.matchAll(sentenceBoundary)) {
        const candidate = (match.index ?? 0) + match[0].length;
        if (candidate >= minimumPreferredBreak) preferredBreak = candidate;
      }

      if (preferredBreak === -1) {
        const whitespaceBoundary = /\s+/gu;
        for (const match of window.matchAll(whitespaceBoundary)) {
          const candidate = (match.index ?? 0) + match[0].length;
          if (candidate >= minimumPreferredBreak) preferredBreak = candidate;
        }
      }

      if (preferredBreak !== -1) {
        endCharOffset = startCharOffset + preferredBreak;
      } else if (
        endCharOffset < text.length &&
        endCharOffset - 1 > startCharOffset &&
        /[\uDC00-\uDFFF]/u.test(text[endCharOffset]) &&
        /[\uD800-\uDBFF]/u.test(text[endCharOffset - 1])
      ) {
        endCharOffset -= 1;
      }
    }

    chunks.push({
      text: text.slice(startCharOffset, endCharOffset),
      startCharOffset,
      endCharOffset,
    });
    startCharOffset = endCharOffset;
  }

  return chunks;
}

interface InworldAudio {
  audioContent: string;
  timestampInfo: any;
}

/**
 * Tokenizes a line or paragraph of text into stable, punctuation-aware words
 * with exact character start and end index bounds.
 * Uses unicode property escapes to support multi-language text.
 */
export function tokenizeBlock(blockText: string): TextToken[] {
  const tokens: TextToken[] = [];
  // Match alphanumeric words including letters, numbers, and apostrophes/dashes
  const regex = /[\p{L}\p{N}'’\-]+/gu;
  let match;
  let elementIndex = 0;

  while ((match = regex.exec(blockText)) !== null) {
    tokens.push({
      word: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      elementIndex: elementIndex++,
    });
  }

  return tokens;
}

export interface TTSEngineConfig {
  voice?: SpeechSynthesisVoice | null;
  rate?: number;   // default: 1.0
  pitch?: number;  // default: 1.0
  volume?: number; // default: 1.0
  forceSimulation?: boolean; // run in simulation mode (useful for testing/headless)
  onWordBoundary?: (wordIndex: number, charIndex: number) => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;

  // Inworld TTS configurations
  inworldEnabled?: boolean;
  inworldApiKey?: string;
  inworldEndpoint?: string;
  inworldVoiceId?: string;

  // Fish Audio configurations
  provider?: 'inworld' | 'fish-audio';
  fishAudioVoiceId?: string;
  fishAudioApiKey?: string;
  /** Optional hook after a successful neural TTS fetch (used to warm shared sample audio). */
  onAudioFetched?: (clip: {
    text: string;
    provider: string;
    voiceId: string;
    audioContent: string;
  }) => void;
}

export class TTSEngine {
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' ? window.speechSynthesis : null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private currentBlockText = "";
  private currentBlockIndex = -1;
  private currentTokens: TextToken[] = [];
  private activeWordIndex = -1;
  private startCharOffset = 0;
  private isPlayingInternal = false;

  // Inworld TTS state variables
  private audioPlayer: HTMLAudioElement | null = null;
  private audioObjectUrl: string | null = null;
  private inworldCache: Map<string, InworldAudio> = new Map();
  private inworldRequests: Map<string, Promise<InworldAudio>> = new Map();
  private playRequestId = 0;
  private trackingFrameId: any = null;
  private currentTokensWithTimestamps: {
    word: string;
    startIndex: number;
    endIndex: number;
    elementIndex: number;
    startTime: number;
    endTime: number;
  }[] = [];

  // Configuration options
  private config: Required<Omit<TTSEngineConfig, 'onWordBoundary' | 'onEnd' | 'onError' | 'onPause' | 'onResume' | 'onStop' | 'inworldEnabled' | 'inworldApiKey' | 'inworldEndpoint' | 'inworldVoiceId' | 'provider' | 'fishAudioVoiceId' | 'fishAudioApiKey' | 'onAudioFetched'>> & {
    onWordBoundary: TTSEngineConfig['onWordBoundary'];
    onEnd: TTSEngineConfig['onEnd'];
    onError: TTSEngineConfig['onError'];
    onPause: TTSEngineConfig['onPause'];
    onResume: TTSEngineConfig['onResume'];
    onStop: TTSEngineConfig['onStop'];
    onAudioFetched?: TTSEngineConfig['onAudioFetched'];
    inworldEnabled?: boolean;
    inworldApiKey?: string;
    inworldEndpoint?: string;
    inworldVoiceId?: string;
    provider?: 'inworld' | 'fish-audio';
    fishAudioVoiceId?: string;
    fishAudioApiKey?: string;
  };

  // Simulation Fallback state (for environments where onboundary doesn't fire)
  private hasReceivedBoundaryEvent = false;
  private fallbackTimer: any = null;
  private fallbackStartTime = 0;
  private fallbackElapsedOnPause = 0;
  private fallbackTokensRemaining: TextToken[] = [];

  // Strong reference to prevent garbage collection on long-running speech utterances (fixes the Chrome 15s bug)
  private static utteranceHolder: any = {};

  constructor(config: TTSEngineConfig = {}) {
    this.config = {
      voice: null,
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      forceSimulation: false,
      onWordBoundary: undefined,
      onEnd: undefined,
      onError: undefined,
      onPause: undefined,
      onResume: undefined,
      onStop: undefined,
      inworldEnabled: false,
      inworldApiKey: "",
      inworldEndpoint: "",
      inworldVoiceId: "Ashley",
      provider: "inworld",
      fishAudioVoiceId: "933563129e564b19a115bedd57b7406a",
      fishAudioApiKey: "",
      ...config,
    };
  }

  /**
   * Loads a block of text, tokenizing it into stable visual nodes.
   */
  setBlock(blockIndex: number, text: string) {
    this.playRequestId += 1;
    this.cleanup();
    this.currentBlockIndex = blockIndex;
    this.currentBlockText = text;
    this.currentTokens = tokenizeBlock(text);
    this.activeWordIndex = -1;
    this.startCharOffset = 0;

    // Background pre-fetch Inworld audio to make transitions instantaneous
    if (this.hasInworldRoute()) {
      const firstChunk = splitTextForInworld(text)[0];
      if (firstChunk) this.prefetchInworld(firstChunk.text);
    }
  }

  getBlockIndex(): number {
    return this.currentBlockIndex;
  }

  getTokens(): TextToken[] {
    return [...this.currentTokens];
  }

  getActiveWordIndex(): number {
    return this.activeWordIndex;
  }

  /**
   * Warms the first audio chunk for upcoming logical blocks. Callers provide
   * blocks in playback priority order; duplicate and already-cached requests
   * are coalesced by fetchInworldAudio.
   */
  preloadBlocks(blocks: string[], maxBlocks = 3) {
    if (
      !this.hasInworldRoute() ||
      !Number.isInteger(maxBlocks) ||
      maxBlocks < 1
    ) {
      return;
    }

    blocks
      .filter((block) => block.trim())
      .slice(0, maxBlocks)
      .forEach((block) => {
        const firstChunk = splitTextForInworld(block)[0];
        if (firstChunk) this.prefetchInworld(firstChunk.text);
      });
  }

  private cleanup() {
    this.clearFallbackTimer();
    this.activeUtterance = null;
    this.fallbackElapsedOnPause = 0;
    this.stopInworldTracking();
    this.currentTokensWithTimestamps = [];

    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.src = "";
      this.audioPlayer = null;
    }
    if (this.audioObjectUrl) {
      URL.revokeObjectURL(this.audioObjectUrl);
      this.audioObjectUrl = null;
    }

    if (this.synth) {
      this.synth.cancel();
      // Workaround for Chrome/Safari on macOS: calling resume() immediately after cancel()
      // un-freezes/unsticks SpeechSynthesis and clears stuck utterance buffers.
      this.synth.resume();
    }
  }

  /**
   * Starts speaking the loaded text block.
  * Can optionally start from a specific word boundary.
  */
  play(fromWordIndex = 0) {
    const requestId = ++this.playRequestId;
    this.isPlayingInternal = true;

    if (this.currentTokens.length === 0) {
      // Empty block, resolve instantly
      this.isPlayingInternal = false;
      this.triggerEnd();
      return;
    }

    // If Inworld is enabled, route to Inworld engine
    if (this.hasInworldRoute()) {
      const chunks = splitTextForInworld(this.currentBlockText);
      const chunkIndex = this.findInworldChunkIndex(chunks, fromWordIndex);
      void this.playInworldChunk(chunks, chunkIndex, fromWordIndex, requestId);
      return;
    }

    this.playNativeFallback(fromWordIndex);
  }

  /**
   * Helper to perform high-fidelity Inworld playback from cache
   */
  private playInworldCached(
    cached: InworldAudio,
    chunks: InworldTextChunk[],
    chunkIndex: number,
    fromWordIndex: number,
    requestId: number,
  ) {
    this.cleanup();
    this.isPlayingInternal = true;
    this.activeWordIndex = -1;

    try {
      const chunk = chunks[chunkIndex];
      const blob = this.base64ToBlob(cached.audioContent, 'audio/mp3');
      const audioUrl = URL.createObjectURL(blob);
      this.audioObjectUrl = audioUrl;

      // Extract Inworld raw words and timing markers
      const words = cached.timestampInfo?.wordAlignment?.words || [];
      const wordStartTimeSeconds = cached.timestampInfo?.wordAlignment?.wordStartTimeSeconds || [];
      const wordEndTimeSeconds = cached.timestampInfo?.wordAlignment?.wordEndTimeSeconds || [];

      // Align raw Inworld tokens with character positions in the original block.
      let cursor = 0;
      const inworldAligned: {
        word: string;
        startIndex: number;
        endIndex: number;
        startTime: number;
        endTime: number;
      }[] = [];

      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        // Skip leading whitespaces or symbols for finding index
        const cleanedWord = w.trim();
        if (cleanedWord === "") {
          inworldAligned.push({
            word: w,
            startIndex: chunk.startCharOffset + cursor,
            endIndex: chunk.startCharOffset + cursor + w.length,
            startTime: wordStartTimeSeconds[i] || 0,
            endTime: wordEndTimeSeconds[i] || 0,
          });
          cursor += w.length;
          continue;
        }

        const chunkStartIndex = chunk.text.indexOf(cleanedWord, cursor);
        if (chunkStartIndex !== -1) {
          const chunkEndIndex = chunkStartIndex + cleanedWord.length;
          inworldAligned.push({
            word: w,
            startIndex: chunk.startCharOffset + chunkStartIndex,
            endIndex: chunk.startCharOffset + chunkEndIndex,
            startTime: wordStartTimeSeconds[i] || 0,
            endTime: wordEndTimeSeconds[i] || 0,
          });
          cursor = chunkEndIndex;
        } else {
          inworldAligned.push({
            word: w,
            startIndex: chunk.startCharOffset + cursor,
            endIndex: chunk.startCharOffset + cursor + w.length,
            startTime: wordStartTimeSeconds[i] || 0,
            endTime: wordEndTimeSeconds[i] || 0,
          });
          cursor += w.length;
        }
      }

      // Map Inworld timestamps to our exact alphanumeric currentTokens
      const chunkTokens = this.currentTokens.filter((token) => (
        token.endIndex > chunk.startCharOffset &&
        token.startIndex < chunk.endCharOffset
      ));

      this.currentTokensWithTimestamps = chunkTokens.map((ourToken) => {
        // Find all overlapping Inworld raw tokens
        const overlappingInworld = inworldAligned.filter(iw => {
          const overlapStart = Math.max(ourToken.startIndex, iw.startIndex);
          const overlapEnd = Math.min(ourToken.endIndex, iw.endIndex);
          return overlapStart < overlapEnd;
        });

        if (overlappingInworld.length > 0) {
          // If multiple overlaps found (e.g. word chunked or matched with whitespace/punctuation),
          // map to the widest time span.
          const startTime = Math.min(...overlappingInworld.map(iw => iw.startTime));
          const endTime = Math.max(...overlappingInworld.map(iw => iw.endTime));
          return {
            ...ourToken,
            startTime,
            endTime,
          };
        }

        // Fallback: search for direct textual match in the aligned array
        const textMatch = inworldAligned.find(iw => iw.word.trim().toLowerCase() === ourToken.word.toLowerCase());
        if (textMatch) {
          return {
            ...ourToken,
            startTime: textMatch.startTime,
            endTime: textMatch.endTime,
          };
        }

        return {
          ...ourToken,
          startTime: 0,
          endTime: 0,
        };
      });

      const usableTimestampCount = this.currentTokensWithTimestamps.filter((token) => (
        Number.isFinite(token.startTime) &&
        Number.isFinite(token.endTime) &&
        token.endTime > token.startTime
      )).length;

      if (usableTimestampCount === 0) {
        throw new Error('Inworld returned no usable word timestamps.');
      }

      const player = new Audio(audioUrl);
      this.audioPlayer = player;
      player.volume = this.config.volume;
      player.playbackRate = this.config.rate;

      player.onloadedmetadata = () => {
        if (this.currentTokensWithTimestamps.length > 0 && fromWordIndex > 0) {
          const token = this.currentTokensWithTimestamps.find(
            (candidate) => candidate.elementIndex === fromWordIndex,
          );
          if (token) {
            player.currentTime = token.startTime;
          }
        }
      };

      player.onended = () => {
        this.stopInworldTracking();
        URL.revokeObjectURL(audioUrl);
        if (this.audioObjectUrl === audioUrl) this.audioObjectUrl = null;
        if (this.audioPlayer === player) {
          this.audioPlayer = null;
          if (requestId !== this.playRequestId) return;

          const nextChunkIndex = chunkIndex + 1;
          const nextChunk = chunks[nextChunkIndex];
          if (nextChunk) {
            const nextToken = this.currentTokens.find((token) => (
              token.endIndex > nextChunk.startCharOffset &&
              token.startIndex < nextChunk.endCharOffset
            ));
            void this.playInworldChunk(
              chunks,
              nextChunkIndex,
              nextToken?.elementIndex ?? fromWordIndex,
              requestId,
            );
          } else {
            this.triggerEnd();
          }
        }
      };

      player.onerror = (e) => {
        console.error("🐝 [TTSEngine] Inworld audio player error:", e);
        URL.revokeObjectURL(audioUrl);
        if (this.audioObjectUrl === audioUrl) this.audioObjectUrl = null;
        this.stopInworldTracking();
        if (this.audioPlayer === player) {
          this.audioPlayer = null;
          console.warn("🐝 [TTSEngine] Falling back to native SpeechSynthesis due to audio element error.");
          this.playNativeFallback(fromWordIndex);
        }
      };

      const playPromise = player.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          this.startInworldTracking();
        }).catch(err => {
          console.error("🐝 [TTSEngine] play() failed:", err);
          console.warn("🐝 [TTSEngine] Falling back to native SpeechSynthesis due to play rejection.");
          this.playNativeFallback(fromWordIndex);
        });
      }
    } catch (err) {
      console.error("🐝 [TTSEngine] Failed to load cached Inworld audio:", err);
      this.playNativeFallback(fromWordIndex);
    }
  }

  private findInworldChunkIndex(chunks: InworldTextChunk[], fromWordIndex: number): number {
    const safeWordIndex = Math.max(0, Math.min(fromWordIndex, this.currentTokens.length - 1));
    const token = this.currentTokens[safeWordIndex];
    if (!token) return 0;

    const startingChunk = chunks.findIndex((chunk) => (
      token.startIndex >= chunk.startCharOffset &&
      token.startIndex < chunk.endCharOffset
    ));
    if (startingChunk !== -1) return startingChunk;

    const overlappingChunk = chunks.findIndex((chunk) => (
      token.endIndex > chunk.startCharOffset &&
      token.startIndex < chunk.endCharOffset
    ));
    return Math.max(0, overlappingChunk);
  }

  private async playInworldChunk(
    chunks: InworldTextChunk[],
    chunkIndex: number,
    fromWordIndex: number,
    requestId: number,
  ) {
    const chunk = chunks[chunkIndex];
    if (!chunk || requestId !== this.playRequestId) return;

    const blockIndex = this.currentBlockIndex;
    const blockText = this.currentBlockText;
    this.activeWordIndex = fromWordIndex;
    const nextChunk = chunks[chunkIndex + 1];
    if (nextChunk) this.prefetchInworld(nextChunk.text);

    try {
      const cached = await this.fetchInworldAudio(chunk.text);
      if (
        requestId !== this.playRequestId ||
        blockIndex !== this.currentBlockIndex ||
        blockText !== this.currentBlockText ||
        !this.isPlayingInternal
      ) {
        return;
      }
      this.playInworldCached(cached, chunks, chunkIndex, fromWordIndex, requestId);
    } catch (err: any) {
      if (requestId !== this.playRequestId) return;
      console.error("🐝 [TTSEngine] Inworld fetch failed:", err);

      if (this.config.onError) {
        this.config.onError(err);
      }

      console.warn("🐝 [TTSEngine] Falling back to native SpeechSynthesis due to API failure.");
      this.playNativeFallback(fromWordIndex);
    }
  }

  /**
   * Shared, deduplicated Inworld fetch used by foreground playback and prefetch.
   */
  private fetchInworldAudio(text: string): Promise<InworldAudio> {
    const cacheKey = this.getInworldCacheKey(text);
    const cached = this.inworldCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    const existingRequest = this.inworldRequests.get(cacheKey);
    if (existingRequest) return existingRequest;

    const request = (async () => {
      const endpoint = this.config.inworldEndpoint || "https://api.inworld.ai/tts/v1/voice";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (!this.config.inworldEndpoint) {
        const apiKey = this.config.inworldApiKey || "";
        headers.Authorization = apiKey.startsWith("Basic ") ? apiKey : `Basic ${apiKey}`;
      }

      const provider = this.config.provider || "inworld";
      const body: Record<string, any> = {
        provider,
        text,
      };

      if (provider === 'fish-audio') {
        body.voiceId = this.config.fishAudioVoiceId || "933563129e564b19a115bedd57b7406a";
        body.modelId = "s2.1-pro-free";
        if (this.config.fishAudioApiKey) {
          body.fishAudioApiKey = this.config.fishAudioApiKey;
        }
      } else {
        body.voiceId = this.config.inworldVoiceId || "Ashley";
        body.modelId = "inworld-tts-2";
        body.timestampType = "WORD";
        body.audioConfig = {
          audioEncoding: "MP3",
          sampleRateHertz: 22050,
        };
        if (this.config.inworldApiKey) {
          body.apiKey = this.config.inworldApiKey;
        }
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.message || `HTTP ${response.status}`;
        throw new Error(`Inworld API returned error: ${msg}`);
      }

      const data = await response.json();
      if (!data.audioContent) {
        throw new Error("No audioContent returned from Inworld API");
      }

      const audio = {
        audioContent: data.audioContent,
        timestampInfo: data.timestampInfo,
      };
      this.inworldCache.set(cacheKey, audio);
      const voiceId = provider === 'fish-audio'
        ? (this.config.fishAudioVoiceId || '933563129e564b19a115bedd57b7406a')
        : (this.config.inworldVoiceId || 'Ashley');
      try {
        this.config.onAudioFetched?.({
          text,
          provider,
          voiceId,
          audioContent: data.audioContent,
        });
      } catch {
        // publish hooks must never break playback
      }
      return audio;
    })();

    this.inworldRequests.set(cacheKey, request);
    void request.finally(() => {
      if (this.inworldRequests.get(cacheKey) === request) {
        this.inworldRequests.delete(cacheKey);
      }
    }).catch(() => undefined);
    return request;
  }

  /**
   * Helper to pre-fetch Inworld audio in the background
   */
  private prefetchInworld(text: string) {
    if (!text) return;
    void this.fetchInworldAudio(text).catch(err => {
      console.warn("🐝 [TTSEngine] Background pre-fetch failed:", err);
    });
  }

  private getInworldCacheKey(text: string): string {
    const voiceId = this.config.provider === 'fish-audio'
      ? (this.config.fishAudioVoiceId || '933563129e564b19a115bedd57b7406a')
      : (this.config.inworldVoiceId || 'Ashley');
    return `${this.config.provider || 'inworld'}\u0000${voiceId}\u0000${text}`;
  }

  private hasInworldRoute(): boolean {
    return Boolean(
      (this.config.inworldEnabled || this.config.provider === 'fish-audio') &&
      (this.config.inworldEndpoint || this.config.inworldApiKey),
    );
  }

  /**
   * Standard browser SpeechSynthesis playback flow (serving as primary native & error fallback)
   */
  private playNativeFallback(fromWordIndex: number) {
    const startIndex = Math.max(0, Math.min(fromWordIndex, this.currentTokens.length - 1));
    this.activeWordIndex = startIndex;

    const startToken = this.currentTokens[startIndex];
    this.startCharOffset = startToken ? startToken.startIndex : 0;

    this.cleanup();

    if (!this.synth || this.config.forceSimulation) {
      if (this.config.forceSimulation) {
        this.startFallbackTimer(startIndex);
        return;
      }
      this.isPlayingInternal = false;
      this.triggerError(new Error("SpeechSynthesis is not supported in this environment."));
      return;
    }

    const textToSpeak = this.currentBlockText.slice(this.startCharOffset);
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    this.activeUtterance = utterance;

    const utteranceId = `u_${Date.now()}_${Math.random()}`;
    TTSEngine.utteranceHolder[utteranceId] = utterance;

    if (this.config.voice) {
      utterance.voice = this.config.voice;
    }
    utterance.rate = this.config.rate;
    utterance.pitch = this.config.pitch;
    utterance.volume = this.config.volume;

    this.hasReceivedBoundaryEvent = false;

    utterance.onstart = () => {
      this.startFallbackTimer(startIndex);
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        this.hasReceivedBoundaryEvent = true;
        this.clearFallbackTimer();

        const absoluteCharIndex = event.charIndex + this.startCharOffset;
        const matchedToken = this.currentTokens.find(
          (t) => absoluteCharIndex >= t.startIndex && absoluteCharIndex < t.endIndex
        );

        if (matchedToken) {
          this.activeWordIndex = matchedToken.elementIndex;
          this.triggerWordBoundary(matchedToken.elementIndex, absoluteCharIndex);
        }
      }
    };

    utterance.onend = () => {
      delete TTSEngine.utteranceHolder[utteranceId];
      this.clearFallbackTimer();
      if (this.activeUtterance === utterance) {
        this.activeUtterance = null;
        this.triggerEnd();
      }
    };

    utterance.onerror = (event) => {
      delete TTSEngine.utteranceHolder[utteranceId];
      this.clearFallbackTimer();
      if (event.error !== 'interrupted' && this.activeUtterance === utterance) {
        this.activeUtterance = null;
        this.triggerError(event);
      }
    };

    this.synth.speak(utterance);
  }

  /**
   * Pauses active speech synthesis.
   */
  pause() {
    if (this.hasInworldRoute() && this.audioPlayer) {
      this.audioPlayer.pause();
      this.stopInworldTracking();
      if (this.config.onPause) this.config.onPause();
      return;
    }

    if (this.synth && this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
      // Pause simulation metrics
      if (!this.hasReceivedBoundaryEvent && this.fallbackTimer) {
        this.fallbackElapsedOnPause += Date.now() - this.fallbackStartTime;
        this.clearFallbackTimer();
      }

      if (this.config.onPause) this.config.onPause();
    }
  }

  /**
   * Resumes paused speech synthesis.
   */
  resume() {
    if (this.hasInworldRoute() && this.audioPlayer) {
      this.audioPlayer.play().then(() => {
        this.startInworldTracking();
        if (this.config.onResume) this.config.onResume();
      }).catch(err => {
        console.error("🐝 [TTSEngine] Inworld resume play failed:", err);
      });
      return;
    }

    if (this.synth && this.synth.paused) {
      this.synth.resume();
      // Resume simulation
      if (!this.hasReceivedBoundaryEvent && this.activeWordIndex !== -1) {
        this.startFallbackTimer(this.activeWordIndex);
      }

      if (this.config.onResume) this.config.onResume();
    }
  }

  /**
   * Stops speaking and resets pointers.
   */
  stop() {
    this.isPlayingInternal = false;
    this.playRequestId += 1;
    this.stopInworldTracking();

    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.src = "";
      this.audioPlayer = null;
    }

    this.cleanup();

    if (this.config.onStop) this.config.onStop();
  }

  /**
   * Prime the neural TTS cache with shared/prebaked clips.
   * Cache keys match live synthesis (`provider\\0voiceId\\0text`).
   */
  primeAudioCache(clips: Array<{
    text: string;
    provider: string;
    voiceId: string;
    audioContent: string;
    timestampInfo?: unknown;
  }>) {
    for (const clip of clips) {
      if (!clip.text || !clip.audioContent) continue;
      const key = `${clip.provider}\u0000${clip.voiceId}\u0000${clip.text}`;
      if (this.inworldCache.has(key)) continue;
      this.inworldCache.set(key, {
        audioContent: clip.audioContent,
        timestampInfo: clip.timestampInfo,
      });
    }
  }

  updateConfig(newConfig: Partial<TTSEngineConfig>) {
    this.config = {
      ...this.config,
      ...newConfig,
    };
    
    // Update volume and speed dynamically if playing Inworld audio
    if (this.hasInworldRoute() && this.audioPlayer) {
      if (typeof newConfig.volume === 'number') {
        this.audioPlayer.volume = newConfig.volume;
      }
      if (typeof newConfig.rate === 'number') {
        this.audioPlayer.playbackRate = newConfig.rate;
      }
    }

    // If playing and not paused, restart native engine with new configs from current position
    if (this.isPlayingInternal && !this.config.inworldEnabled && this.synth && !this.synth.paused) {
      this.play(this.activeWordIndex);
    }
  }

  // =========================================================================
  // Inworld tracking loops
  // =========================================================================

  private startInworldTracking() {
    this.stopInworldTracking();

    const track = () => {
      this.updateInworldHighlight();
      if (this.isPlayingInternal && this.audioPlayer && !this.audioPlayer.paused) {
        this.trackingFrameId = requestAnimationFrame(track);
      }
    };

    this.trackingFrameId = requestAnimationFrame(track);
  }

  private stopInworldTracking() {
    if (this.trackingFrameId) {
      cancelAnimationFrame(this.trackingFrameId);
      this.trackingFrameId = null;
    }
  }

  private updateInworldHighlight() {
    if (!this.audioPlayer || this.currentTokensWithTimestamps.length === 0) return;

    const currentTime = this.audioPlayer.currentTime;

    // Find which word is currently being spoken
    let activeTokenIndex = -1;
    for (let i = 0; i < this.currentTokensWithTimestamps.length; i++) {
      const t = this.currentTokensWithTimestamps[i];
      if (t.endTime > t.startTime && currentTime >= t.startTime && currentTime <= t.endTime) {
        activeTokenIndex = i;
        break;
      }
    }

    // Fallback: find the last word whose startTime has passed
    if (activeTokenIndex === -1) {
      for (let i = 0; i < this.currentTokensWithTimestamps.length; i++) {
        const token = this.currentTokensWithTimestamps[i];
        if (token.endTime > token.startTime && currentTime >= token.startTime) {
          activeTokenIndex = i;
        }
      }
    }

    // If the active index changed, trigger the word boundary callback
    const activeToken = this.currentTokensWithTimestamps[activeTokenIndex];
    if (activeToken && activeToken.elementIndex !== this.activeWordIndex) {
      this.activeWordIndex = activeToken.elementIndex;
      const token = this.currentTokensWithTimestamps[activeTokenIndex];
      this.triggerWordBoundary(token.elementIndex, token.startIndex);
    }
  }

  private base64ToBlob(base64: string, contentType: string): Blob {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: contentType });
  }

  // =========================================================================
  // Fallback simulation timer (calculates pacing using word lengths/WPM rate)
  // =========================================================================

  private startFallbackTimer(startingWordIndex: number) {
    this.clearFallbackTimer();
    this.fallbackStartTime = Date.now();

    // Average reading rate: ~150 words per minute at 1.0 rate
    const baseWPM = 150;
    const currentWPM = baseWPM * this.config.rate;
    const msPerCharacter = (60000 / currentWPM) / 5; // assume average word has 5 characters

    this.fallbackTokensRemaining = this.currentTokens.slice(startingWordIndex);

    const advanceWordSimulation = () => {
      if (this.fallbackTokensRemaining.length === 0) {
        this.triggerEnd();
        return;
      }

      const activeToken = this.fallbackTokensRemaining[0];
      this.activeWordIndex = activeToken.elementIndex;
      this.triggerWordBoundary(activeToken.elementIndex, activeToken.startIndex);

      this.fallbackTokensRemaining.shift();

      if (this.fallbackTokensRemaining.length > 0) {
        const nextToken = this.fallbackTokensRemaining[0];
        // Scale wait duration by length of upcoming word
        const wordCharLength = nextToken.word.length;
        const delay = Math.max(120, wordCharLength * msPerCharacter);

        this.fallbackStartTime = Date.now();
        this.fallbackElapsedOnPause = 0;
        this.fallbackTimer = setTimeout(advanceWordSimulation, delay);
      } else {
        // Last word has been read; wait for its duration to finish before ending section
        const lastWordLength = activeToken.word.length;
        const delay = Math.max(120, lastWordLength * msPerCharacter);
        this.fallbackTimer = setTimeout(() => {
          this.triggerEnd();
        }, delay);
      }
    };

    // Trigger the initial word simulation
    if (this.fallbackTokensRemaining.length > 0) {
      const firstWordLength = this.fallbackTokensRemaining[0].word.length;
      const initialDelay = Math.max(50, (firstWordLength * msPerCharacter) - this.fallbackElapsedOnPause);
      this.fallbackTimer = setTimeout(advanceWordSimulation, initialDelay);
    }
  }

  private clearFallbackTimer() {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  // =========================================================================
  // Dispatch callbacks
  // =========================================================================

  private triggerWordBoundary(wordIndex: number, charIndex: number) {
    if (this.config.onWordBoundary) {
      this.config.onWordBoundary(wordIndex, charIndex);
    }
  }

  private triggerEnd() {
    this.isPlayingInternal = false;
    this.activeWordIndex = -1;
    if (this.config.onEnd) {
      this.config.onEnd();
    }
  }

  private triggerError(err: any) {
    if (this.config.onError) {
      this.config.onError(err);
    }
  }
}
