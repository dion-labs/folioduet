import { afterEach, describe, expect, it, vi } from 'vitest';
import { TTSEngine } from './TTSEngine';

function setup() {
  const speak = vi.fn();
  const players: FakeAudio[] = [];
  class FakeAudio {
    volume = 1; playbackRate = 1; currentTime = 0; src = ''; paused = false;
    onloadedmetadata: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    error = { code: 4, message: 'Unsupported test codec' };
    reject!: (error: Error) => void;
    resolve!: () => void;
    play = vi.fn(() => new Promise<void>((resolve, reject) => { this.resolve = resolve; this.reject = reject; }));
    pause = vi.fn(() => { this.paused = true; });
    constructor() { players.push(this); }
  }
  vi.stubGlobal('window', { atob, speechSynthesis: { speak, cancel: vi.fn(), resume: vi.fn() } });
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const engine = new TTSEngine({ provider: 'fish-audio', inworldEndpoint: '/api/tts/synthesize' });
  for (const text of ['Hello world', 'Another passage']) {
    engine.primeAudioCache([{ text, provider: 'fish-audio', voiceId: '933563129e564b19a115bedd57b7406a',
      audioContent: 'YQ==', timestampInfo: { wordAlignment: { words: text.split(' '),
        wordStartTimeSeconds: [0, 0.2], wordEndTimeSeconds: [0.2, 0.4] } } }]);
  }
  engine.setBlock(0, 'Hello world');
  return { engine, players, speak };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('neural player lifecycle', () => {
  it('does not start fallback after Stop rejects an outstanding play', async () => {
    const { engine, players, speak } = setup();
    engine.play();
    await vi.waitFor(() => expect(players).toHaveLength(1));
    engine.stop();
    players[0].reject(new DOMException('Interrupted by pause', 'AbortError'));
    await Promise.resolve(); await Promise.resolve();
    expect(speak).not.toHaveBeenCalled();
  });

  it('ignores a stale rejection after changing the current block', async () => {
    const { engine, players, speak } = setup();
    engine.play();
    await vi.waitFor(() => expect(players).toHaveLength(1));
    engine.setBlock(1, 'Another passage');
    engine.play();
    await vi.waitFor(() => expect(players).toHaveLength(2));
    players[0].reject(new DOMException('Previous play aborted', 'AbortError'));
    await Promise.resolve(); await Promise.resolve();
    expect(speak).not.toHaveBeenCalled();
    expect(players[1].pause).not.toHaveBeenCalled();
    engine.stop();
  });

  it('starts fallback only once if media error and play rejection both fire', async () => {
    const { engine, players, speak } = setup();
    engine.play();
    await vi.waitFor(() => expect(players).toHaveLength(1));
    const errorCallback = players[0].onerror;
    errorCallback?.();
    players[0].reject(new DOMException('Codec unavailable', 'NotSupportedError'));
    await Promise.resolve(); await Promise.resolve();
    expect(speak).toHaveBeenCalledTimes(1);
    engine.stop();
  });
});
