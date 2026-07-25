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
  inworldVoiceId?: string;
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
  private inworldCache: Map<string, { audioContent: string; timestampInfo: any }> = new Map();
  private isFetchingInworld = false;
  private playPending = false;
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
  private config: Required<Omit<TTSEngineConfig, 'onWordBoundary' | 'onEnd' | 'onError' | 'onPause' | 'onResume' | 'onStop' | 'inworldEnabled' | 'inworldApiKey' | 'inworldVoiceId'>> & {
    onWordBoundary: TTSEngineConfig['onWordBoundary'];
    onEnd: TTSEngineConfig['onEnd'];
    onError: TTSEngineConfig['onError'];
    onPause: TTSEngineConfig['onPause'];
    onResume: TTSEngineConfig['onResume'];
    onStop: TTSEngineConfig['onStop'];
    inworldEnabled?: boolean;
    inworldApiKey?: string;
    inworldVoiceId?: string;
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
      inworldVoiceId: "Ashley",
      ...config,
    };
  }

  /**
   * Loads a block of text, tokenizing it into stable visual nodes.
   */
  setBlock(blockIndex: number, text: string) {
    console.log("🐝 [TTSEngine] setBlock called for block index:", blockIndex, "text snippet:", text.slice(0, 30) + "...");
    this.cleanup();
    this.currentBlockIndex = blockIndex;
    this.currentBlockText = text;
    this.currentTokens = tokenizeBlock(text);
    this.activeWordIndex = -1;
    this.startCharOffset = 0;

    // Background pre-fetch Inworld audio to make transitions instantaneous
    if (this.config.inworldEnabled && this.config.inworldApiKey) {
      this.prefetchInworld(text);
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

  private cleanup() {
    console.log("🐝 [TTSEngine] cleanup called. activeUtterance reset. Canceling synth and custom audio.");
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
    console.log("🐝 [TTSEngine] play called. fromWordIndex:", fromWordIndex, "current tokens count:", this.currentTokens.length);
    this.isPlayingInternal = true;

    if (this.currentTokens.length === 0) {
      console.log("🐝 [TTSEngine] play called on empty block. Resolving immediately.");
      // Empty block, resolve instantly
      this.isPlayingInternal = false;
      this.triggerEnd();
      return;
    }

    // If Inworld is enabled, route to Inworld engine
    if (this.config.inworldEnabled && this.config.inworldApiKey) {
      const text = this.currentBlockText;
      const cached = this.inworldCache.get(text);
      if (cached) {
        this.playInworldCached(cached, fromWordIndex);
      } else {
        this.activeWordIndex = fromWordIndex;
        this.playPending = true;
        this.fetchInworld(text, fromWordIndex);
      }
      return;
    }

    this.playNativeFallback(fromWordIndex);
  }

  /**
   * Helper to perform high-fidelity Inworld playback from cache
   */
  private playInworldCached(cached: { audioContent: string; timestampInfo: any }, fromWordIndex: number) {
    console.log("🐝 [TTSEngine] Playing Inworld cached block. fromWordIndex:", fromWordIndex);
    this.cleanup();
    this.isPlayingInternal = true;

    try {
      const blob = this.base64ToBlob(cached.audioContent, 'audio/mp3');
      const audioUrl = URL.createObjectURL(blob);

      // Extract Inworld raw words and timing markers
      const words = cached.timestampInfo?.wordAlignment?.words || [];
      const wordStartTimeSeconds = cached.timestampInfo?.wordAlignment?.wordStartTimeSeconds || [];
      const wordEndTimeSeconds = cached.timestampInfo?.wordAlignment?.wordEndTimeSeconds || [];

      // Align raw Inworld tokens with character positions in blockText
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
            startIndex: cursor,
            endIndex: cursor + w.length,
            startTime: wordStartTimeSeconds[i] || 0,
            endTime: wordEndTimeSeconds[i] || 0,
          });
          cursor += w.length;
          continue;
        }

        const startIndex = this.currentBlockText.indexOf(cleanedWord, cursor);
        if (startIndex !== -1) {
          const endIndex = startIndex + cleanedWord.length;
          inworldAligned.push({
            word: w,
            startIndex,
            endIndex,
            startTime: wordStartTimeSeconds[i] || 0,
            endTime: wordEndTimeSeconds[i] || 0,
          });
          cursor = endIndex;
        } else {
          inworldAligned.push({
            word: w,
            startIndex: cursor,
            endIndex: cursor + w.length,
            startTime: wordStartTimeSeconds[i] || 0,
            endTime: wordEndTimeSeconds[i] || 0,
          });
          cursor += w.length;
        }
      }

      // Map Inworld timestamps to our exact alphanumeric currentTokens
      this.currentTokensWithTimestamps = this.currentTokens.map((ourToken) => {
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

      console.log("🐝 [TTSEngine] Fully mapped Inworld tokens count:", this.currentTokensWithTimestamps.length);

      const player = new Audio(audioUrl);
      this.audioPlayer = player;
      player.volume = this.config.volume;
      player.playbackRate = this.config.rate;

      player.onloadedmetadata = () => {
        if (this.currentTokensWithTimestamps.length > 0 && fromWordIndex > 0) {
          const token = this.currentTokensWithTimestamps[fromWordIndex];
          if (token) {
            console.log("🐝 [TTSEngine] Seeking Inworld audio to start time:", token.startTime, "for word index:", fromWordIndex);
            player.currentTime = token.startTime;
          }
        }
      };

      player.onended = () => {
        console.log("🐝 [TTSEngine] Inworld audio player ended naturally.");
        this.stopInworldTracking();
        URL.revokeObjectURL(audioUrl);
        if (this.audioPlayer === player) {
          this.audioPlayer = null;
          this.triggerEnd();
        }
      };

      player.onerror = (e) => {
        console.error("🐝 [TTSEngine] Inworld audio player error:", e);
        URL.revokeObjectURL(audioUrl);
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
          console.log("🐝 [TTSEngine] Inworld audio playback started successfully.");
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

  /**
   * Helper to fetch Inworld audio on-demand
   */
  private async fetchInworld(text: string, fromWordIndex: number) {
    if (this.isFetchingInworld) return;
    this.isFetchingInworld = true;
    console.log("🐝 [TTSEngine] Fetching TTS from Inworld API. Voice:", this.config.inworldVoiceId, "Text:", text.slice(0, 40) + "...");

    try {
      const apiKey = this.config.inworldApiKey || "";
      const authHeader = apiKey.startsWith("Basic ") ? apiKey : `Basic ${apiKey}`;

      const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          voiceId: this.config.inworldVoiceId || "Ashley",
          modelId: "inworld-tts-2",
          timestampType: "WORD",
          audioConfig: {
            audioEncoding: "MP3",
            sampleRateHertz: 22050,
          },
        }),
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

      console.log("🐝 [TTSEngine] Successfully fetched Inworld TTS. Audio length (base64):", data.audioContent.length);

      this.inworldCache.set(text, {
        audioContent: data.audioContent,
        timestampInfo: data.timestampInfo,
      });

      this.isFetchingInworld = false;

      if (this.playPending && this.currentBlockText === text) {
        this.playPending = false;
        this.playInworldCached(
          { audioContent: data.audioContent, timestampInfo: data.timestampInfo },
          fromWordIndex
        );
      }
    } catch (err: any) {
      console.error("🐝 [TTSEngine] Inworld fetch failed:", err);
      this.isFetchingInworld = false;
      this.playPending = false;

      if (this.config.onError) {
        this.config.onError(err);
      }

      console.warn("🐝 [TTSEngine] Falling back to native SpeechSynthesis due to API failure.");
      this.playNativeFallback(fromWordIndex);
    }
  }

  /**
   * Helper to pre-fetch Inworld audio in the background
   */
  private prefetchInworld(text: string) {
    if (!text || this.inworldCache.has(text) || this.isFetchingInworld) return;

    console.log("🐝 [TTSEngine] Pre-fetching Inworld TTS in background for block.");
    const apiKey = this.config.inworldApiKey || "";
    const authHeader = apiKey.startsWith("Basic ") ? apiKey : `Basic ${apiKey}`;

    fetch("https://api.inworld.ai/tts/v1/voice", {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text,
        voiceId: this.config.inworldVoiceId || "Ashley",
        modelId: "inworld-tts-2",
        timestampType: "WORD",
        audioConfig: {
          audioEncoding: "MP3",
          sampleRateHertz: 22050,
        },
      }),
    })
    .then(res => {
      if (res.ok) return res.json();
      return null;
    })
    .then(data => {
      if (data && data.audioContent) {
        console.log("🐝 [TTSEngine] Background pre-fetch success for text block.");
        this.inworldCache.set(text, {
          audioContent: data.audioContent,
          timestampInfo: data.timestampInfo,
        });
      }
    })
    .catch(err => {
      console.warn("🐝 [TTSEngine] Background pre-fetch failed:", err);
    });
  }

  /**
   * Standard browser SpeechSynthesis playback flow (serving as primary native & error fallback)
   */
  private playNativeFallback(fromWordIndex: number) {
    console.log("🐝 [TTSEngine] Executing native SpeechSynthesis play from index:", fromWordIndex);

    const startIndex = Math.max(0, Math.min(fromWordIndex, this.currentTokens.length - 1));
    this.activeWordIndex = startIndex;

    const startToken = this.currentTokens[startIndex];
    this.startCharOffset = startToken ? startToken.startIndex : 0;

    this.cleanup();

    if (!this.synth || this.config.forceSimulation) {
      console.log("🐝 [TTSEngine] Using simulation mode or no native SpeechSynthesis support.");
      if (this.config.forceSimulation) {
        this.startFallbackTimer(startIndex);
        return;
      }
      this.isPlayingInternal = false;
      this.triggerError(new Error("SpeechSynthesis is not supported in this environment."));
      return;
    }

    const textToSpeak = this.currentBlockText.slice(this.startCharOffset);
    console.log("🐝 [TTSEngine] Fallback native TTS slice length:", textToSpeak.length);

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
    console.log("🐝 [TTSEngine] pause called.");
    if (this.config.inworldEnabled && this.config.inworldApiKey && this.audioPlayer) {
      this.audioPlayer.pause();
      this.stopInworldTracking();
      if (this.config.onPause) this.config.onPause();
      return;
    }

    if (this.synth && this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
      console.log("🐝 [TTSEngine] synth.pause() invoked.");

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
    console.log("🐝 [TTSEngine] resume called.");
    if (this.config.inworldEnabled && this.config.inworldApiKey && this.audioPlayer) {
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
      console.log("🐝 [TTSEngine] synth.resume() invoked.");

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
    console.log("🐝 [TTSEngine] stop called. Setting isPlayingInternal to false and triggering cleanup.");
    this.isPlayingInternal = false;
    this.playPending = false;
    this.stopInworldTracking();

    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.src = "";
      this.audioPlayer = null;
    }

    this.cleanup();

    if (this.config.onStop) this.config.onStop();
  }

  updateConfig(newConfig: Partial<TTSEngineConfig>) {
    console.log("🐝 [TTSEngine] updateConfig called with keys:", Object.keys(newConfig));
    this.config = {
      ...this.config,
      ...newConfig,
    };
    
    // Update volume and speed dynamically if playing Inworld audio
    if (this.config.inworldEnabled && this.config.inworldApiKey && this.audioPlayer) {
      if (typeof newConfig.volume === 'number') {
        this.audioPlayer.volume = newConfig.volume;
      }
      if (typeof newConfig.rate === 'number') {
        this.audioPlayer.playbackRate = newConfig.rate;
      }
    }

    // If playing and not paused, restart native engine with new configs from current position
    if (this.isPlayingInternal && !this.config.inworldEnabled && this.synth && !this.synth.paused) {
      console.log("🐝 [TTSEngine] updateConfig: Engine was actively playing, restarting with new configs from index:", this.activeWordIndex);
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
      if (currentTime >= t.startTime && currentTime <= t.endTime) {
        activeTokenIndex = i;
        break;
      }
    }

    // Fallback: find the last word whose startTime has passed
    if (activeTokenIndex === -1) {
      for (let i = 0; i < this.currentTokensWithTimestamps.length; i++) {
        if (currentTime >= this.currentTokensWithTimestamps[i].startTime) {
          activeTokenIndex = i;
        }
      }
    }

    // If the active index changed, trigger the word boundary callback
    if (activeTokenIndex !== -1 && activeTokenIndex !== this.activeWordIndex) {
      this.activeWordIndex = activeTokenIndex;
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
