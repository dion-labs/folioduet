import { useEffect, useState } from 'react';
import {
  ensureFishVoiceModel,
  listFishVoices,
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

export function FishVoicePicker({ voiceId, onChange }: FishVoicePickerProps) {
  const [voices, setVoices] = useState<FishVoiceModel[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(voiceId);

  useEffect(() => {
    setCustomDraft(voiceId);
  }, [voiceId]);

  useEffect(() => {
    let cancelled = false;
    const delay = query.trim().length >= 2 ? 280 : 0;
    const handle = window.setTimeout(() => {
      void (async () => {
        if (voices.length === 0) setStatus('loading');
        setError(null);
        try {
          const title = query.trim().length >= 2 ? query.trim() : undefined;
          const listed = await listFishVoices({ title, pageSize: 40 });
          if (cancelled) return;
          setVoices(listed);
          setStatus('ready');
        } catch (err) {
          if (cancelled) return;
          setStatus('error');
          setError(err instanceof Error ? err.message : 'Could not load Fish voices.');
        }
      })();
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- voices.length only gates the loading flash
  }, [query]);

  useEffect(() => {
    const id = voiceId.trim();
    if (!id || voices.some((voice) => voice.id === id)) return;

    let cancelled = false;
    void (async () => {
      const next = await ensureFishVoiceModel(id, voices);
      if (!cancelled) setVoices(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [voiceId, voices]);

  return (
    <div className="pe-voice-picker">
      <label className="pe-field">
        <span>Voice</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Fish voices…"
          autoComplete="off"
        />
      </label>

      {status === 'loading' && voices.length === 0 ? (
        <p className="pe-settings-hint">Loading voices from Fish Audio…</p>
      ) : null}
      {status === 'error' ? (
        <p className="pe-settings-hint pe-voice-picker-error">
          {error} You can still paste a reference ID below.
        </p>
      ) : null}

      {status === 'ready' && voices.length === 0 ? (
        <p className="pe-settings-hint">No voices matched that search.</p>
      ) : null}

      {voices.length > 0 ? (
        <div className="pe-voice-picker-list" role="listbox" aria-label="Fish Audio voices">
          {voices.map((voice) => {
            const selected = voice.id === voiceId.trim();
            return (
              <button
                key={voice.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`pe-voice-picker-option${selected ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(voice.id);
                  setCustomDraft(voice.id);
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
