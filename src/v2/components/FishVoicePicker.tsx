import { useEffect, useState } from 'react';
import {
  ensureFishVoiceModel,
  fetchFishVoiceModel,
  listFishVoices,
  peekFishVoiceTitle,
  type FishVoiceModel,
} from '../fishVoice';

interface FishVoicePickerProps {
  voiceId: string;
  onChange: (voiceId: string) => void;
}

function truncate(text: string, max = 120): string {
  const value = text.trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function fallbackSelected(voiceId: string): FishVoiceModel {
  const id = voiceId.trim();
  return {
    id,
    title: peekFishVoiceTitle(id) || (id ? 'Custom voice' : 'No voice selected'),
    description: id ? 'Selected reference ID' : 'Choose a Fish Audio voice',
    languages: [],
    tags: [],
  };
}

export function FishVoicePicker({ voiceId, onChange }: FishVoicePickerProps) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<FishVoiceModel | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [voices, setVoices] = useState<FishVoiceModel[]>([]);
  const [query, setQuery] = useState('');
  const [listStatus, setListStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [listError, setListError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(voiceId);

  useEffect(() => {
    setCustomDraft(voiceId);
  }, [voiceId]);

  // Collapsed view: resolve only the current voice (cheap single-model fetch).
  useEffect(() => {
    let cancelled = false;
    const id = voiceId.trim();
    if (!id) {
      setSelected(null);
      setSelectedStatus('ready');
      return undefined;
    }

    setSelectedStatus('loading');
    void (async () => {
      const model = await fetchFishVoiceModel(id);
      if (cancelled) return;
      setSelected(model ?? fallbackSelected(id));
      setSelectedStatus(model ? 'ready' : 'error');
    })();

    return () => {
      cancelled = true;
    };
  }, [voiceId]);

  // Editor: load / search the public list only while editing.
  useEffect(() => {
    if (!editing) return undefined;

    let cancelled = false;
    const delay = query.trim().length >= 2 ? 280 : 0;
    const handle = window.setTimeout(() => {
      void (async () => {
        setListStatus((prev) => (voices.length ? prev : 'loading'));
        setListError(null);
        try {
          const title = query.trim().length >= 2 ? query.trim() : undefined;
          const listed = await listFishVoices({ title, pageSize: 40 });
          if (cancelled) return;
          setVoices(listed);
          setListStatus('ready');
        } catch (err) {
          if (cancelled) return;
          setListStatus('error');
          setListError(err instanceof Error ? err.message : 'Could not load Fish voices.');
        }
      })();
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- voices.length only gates the loading flash
  }, [editing, query]);

  useEffect(() => {
    if (!editing) return undefined;
    const id = voiceId.trim();
    if (!id || voices.some((voice) => voice.id === id)) return undefined;

    let cancelled = false;
    void (async () => {
      const next = await ensureFishVoiceModel(id, voices);
      if (!cancelled) setVoices(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, voiceId, voices]);

  const display = selected ?? fallbackSelected(voiceId);

  if (!editing) {
    return (
      <div className="pe-voice-picker">
        <span className="pe-voice-picker-label">Voice</span>
        <button
          type="button"
          className="pe-voice-picker-current"
          onClick={() => {
            setEditing(true);
            setQuery('');
            setCustomOpen(false);
          }}
          aria-label={`Change voice. Current: ${display.title}`}
        >
          <span className="pe-voice-picker-title">{display.title}</span>
          {selectedStatus === 'loading' ? (
            <span className="pe-voice-picker-desc pe-voice-picker-desc-muted">Loading…</span>
          ) : display.description ? (
            <span className="pe-voice-picker-desc">{truncate(display.description)}</span>
          ) : (
            <span className="pe-voice-picker-desc pe-voice-picker-desc-muted">
              No description
            </span>
          )}
          <span className="pe-voice-picker-change">Change voice</span>
        </button>
      </div>
    );
  }

  return (
    <div className="pe-voice-picker">
      <div className="pe-voice-picker-edit-header">
        <span className="pe-voice-picker-label">Choose a voice</span>
        <button
          type="button"
          className="pe-voice-picker-custom-toggle"
          onClick={() => {
            setEditing(false);
            setQuery('');
            setCustomOpen(false);
          }}
        >
          Done
        </button>
      </div>

      <label className="pe-field">
        <span className="pe-sr-only">Search voices</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Fish voices…"
          autoComplete="off"
          autoFocus
        />
      </label>

      {listStatus === 'loading' && voices.length === 0 ? (
        <p className="pe-settings-hint">Loading voices from Fish Audio…</p>
      ) : null}
      {listStatus === 'error' ? (
        <p className="pe-settings-hint pe-voice-picker-error">
          {listError} You can still paste a reference ID below.
        </p>
      ) : null}

      {listStatus === 'ready' && voices.length === 0 ? (
        <p className="pe-settings-hint">No voices matched that search.</p>
      ) : null}

      {voices.length > 0 ? (
        <div className="pe-voice-picker-list" role="listbox" aria-label="Fish Audio voices">
          {voices.map((voice) => {
            const isSelected = voice.id === voiceId.trim();
            return (
              <button
                key={voice.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`pe-voice-picker-option${isSelected ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(voice.id);
                  setCustomDraft(voice.id);
                  setSelected(voice);
                  setSelectedStatus('ready');
                  setEditing(false);
                  setQuery('');
                  setCustomOpen(false);
                }}
              >
                <span className="pe-voice-picker-title">{voice.title}</span>
                {voice.description ? (
                  <span className="pe-voice-picker-desc">{truncate(voice.description)}</span>
                ) : (
                  <span className="pe-voice-picker-desc pe-voice-picker-desc-muted">
                    No description
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        className="pe-voice-picker-custom-toggle"
        onClick={() => setCustomOpen((open) => !open)}
      >
        {customOpen ? 'Hide custom ID' : 'Use a custom reference ID'}
      </button>

      {customOpen ? (
        <label className="pe-field">
          <span>Reference ID</span>
          <input
            value={customDraft}
            onChange={(event) => {
              const next = event.target.value;
              setCustomDraft(next);
              onChange(next);
            }}
            placeholder="933563129e564b19a115bedd57b7406a"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      ) : null}
    </div>
  );
}
