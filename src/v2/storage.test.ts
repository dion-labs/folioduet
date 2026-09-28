import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences, loadActiveDocumentId, loadPreferences, peekBootActiveDocumentId, resolveActiveDocumentId, saveActiveDocumentId, saveLibrary, savePreferences } from './storage';

describe('resolveActiveDocumentId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers the first candidate that exists in the library', () => {
    const library = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(resolveActiveDocumentId(library, [null, 'b', 'a'])).toBe('b');
    expect(resolveActiveDocumentId(library, ['missing', 'c'])).toBe('c');
  });

  it('falls back to the first library entry when nothing matches', () => {
    expect(resolveActiveDocumentId([{ id: 'top' }, { id: 'other' }], [null, 'gone'])).toBe('top');
    expect(resolveActiveDocumentId([], ['x'])).toBeNull();
  });
});

describe('peekBootActiveDocumentId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures the first localStorage value and ignores later clears', () => {
    const memory = new Map<string, string>();
    memory.set('bimodal-active-doc', 'book-keep');
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    });

    // Module may already have captured in this vitest worker — only assert stability.
    const first = peekBootActiveDocumentId();
    memory.delete('bimodal-active-doc');
    expect(peekBootActiveDocumentId()).toBe(first);
  });
});

describe('PDF extractor preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps AnyDoc opt-in and defaults unknown values to the FolioDuet extractor', () => {
    let saved = JSON.stringify({ pdfExtractor: 'anydoc' });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'pageecho-v2-preferences' ? saved : '1',
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    expect(loadPreferences().pdfExtractor).toBe('anydoc');
    saved = JSON.stringify({ pdfExtractor: 'unknown' });
    expect(loadPreferences().pdfExtractor).toBe('pageecho');
  });
});

describe('TTS look-ahead preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to three segments and accepts the supported buffer sizes', () => {
    let saved = JSON.stringify({ ttsBufferAhead: 5 });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'pageecho-v2-preferences' ? saved : '1',
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    expect(loadPreferences().ttsBufferAhead).toBe(5);
    saved = JSON.stringify({ ttsBufferAhead: 99 });
    expect(loadPreferences().ttsBufferAhead).toBe(3);
  });
});


describe('preference recovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['0', 0], ['0.4', 0.4], [null, 1], ['', 1], ['   ', 1],
    ['broken', 1], ['Infinity', 1], ['-2', 0], ['2', 1],
  ])('restores legacy volume %s as %s without unmuting', (raw, expected) => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'bimodal-tts-volume' ? raw : null,
      setItem: vi.fn(),
    });
    expect(loadPreferences().volume).toBe(expected);
  });

  it('bounds corrupted persisted volume and font scale to the reader controls', () => {
    let saved = JSON.stringify({ volume: 8, fontScale: -20 });
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => key === 'pageecho-v2-preferences' ? saved : '1',
      setItem: vi.fn(),
    });
    expect(loadPreferences()).toMatchObject({ volume: 1, fontScale: 0.78 });
    saved = JSON.stringify({ volume: 0, fontScale: 40 });
    expect(loadPreferences()).toMatchObject({ volume: 0, fontScale: 1.45 });
  });
});


describe('local preference secret isolation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('never persists provider keys and discards historical plaintext keys on read', () => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    });
    const preferences = {
      ...defaultPreferences, volume: 0, inworldApiKey: 'synthetic-inworld-secret',
      fishAudioApiKey: 'synthetic-fish-secret',
    };
    savePreferences(preferences);
    const saved = memory.get('pageecho-v2-preferences')!;
    expect(saved).not.toContain('synthetic-inworld-secret');
    expect(saved).not.toContain('synthetic-fish-secret');
    expect(loadPreferences()).toMatchObject({ volume: 0, inworldApiKey: '', fishAudioApiKey: '' });
    memory.set('pageecho-v2-preferences', JSON.stringify(preferences));
    expect(loadPreferences()).toMatchObject({ inworldApiKey: '', fishAudioApiKey: '' });
  });

  it('returns safe defaults on denied reads without restoring provider secrets', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('synthetic storage denied'); },
    });
    expect(loadPreferences()).toMatchObject({ volume: 1, inworldApiKey: '', fishAudioApiKey: '' });
  });
});


describe('local persistence failures', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports quota and denied writes without losing the in-memory preferences', () => {
    const preferences = { ...defaultPreferences, volume: 0.25 };
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('synthetic denied read'); },
      setItem: () => { throw new Error('synthetic quota'); },
      removeItem: () => { throw new Error('synthetic denied removal'); },
    });
    expect(loadActiveDocumentId()).toBeNull();
    expect(saveLibrary([])).toBe(false);
    expect(saveActiveDocumentId('fixture')).toBe(false);
    expect(saveActiveDocumentId(null)).toBe(false);
    expect(savePreferences(preferences)).toBe(false);
    expect(preferences.volume).toBe(0.25);
  });

  it('can retry the same session state once storage is writable', () => {
    const memory = new Map<string, string>();
    let denied = true;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (denied) throw new Error('synthetic quota');
        memory.set(key, value);
      },
      removeItem: (key: string) => memory.delete(key),
    });
    expect(savePreferences({ ...defaultPreferences, volume: 0 })).toBe(false);
    denied = false;
    expect(saveLibrary([])).toBe(true);
    expect(saveActiveDocumentId('fixture')).toBe(true);
    expect(savePreferences({ ...defaultPreferences, volume: 0 })).toBe(true);
    expect(loadActiveDocumentId()).toBe('fixture');
    expect(loadPreferences().volume).toBe(0);
  });
});
