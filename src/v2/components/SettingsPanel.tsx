import { Moon, ShieldCheck, Sun, X } from 'lucide-react';
import type { ReaderPreferences, SyncStatus, TtsServerStatus } from '../types';

interface SettingsPanelProps {
  open: boolean;
  preferences: ReaderPreferences;
  ttsServerStatus: TtsServerStatus;
  syncStatus: SyncStatus;
  hasNostrSigner: boolean;
  onChange: (preferences: ReaderPreferences) => void;
  onClose: () => void;
}

export function SettingsPanel({
  open,
  preferences,
  ttsServerStatus,
  syncStatus,
  hasNostrSigner,
  onChange,
  onClose,
}: SettingsPanelProps) {
  if (!open) return null;
  const update = <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) => {
    onChange({ ...preferences, [key]: value });
  };

  return (
    <div className="pe-overlay pe-overlay-right" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="pe-settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="pe-dialog-header">
          <div>
            <span className="pe-eyebrow">Reader preferences</span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button className="pe-icon-button" onClick={onClose} aria-label="Close settings">
            <X size={19} />
          </button>
        </div>

        <section className="pe-settings-section">
          <h3>Appearance</h3>
          <div className="pe-segmented pe-segmented-wide">
            <button
              className={preferences.appearance === 'light' ? 'is-active' : ''}
              onClick={() => update('appearance', 'light')}
            >
              <Sun size={16} /> Light
            </button>
            <button
              className={preferences.appearance === 'dark' ? 'is-active' : ''}
              onClick={() => update('appearance', 'dark')}
            >
              <Moon size={16} /> Dark
            </button>
          </div>
        </section>

        <section className="pe-settings-section">
          <div className="pe-setting-heading">
            <div>
              <h3>Persistent neural voice</h3>
              <p>Word timestamps and audio are cached by the PageEcho server.</p>
            </div>
            <label className="pe-switch">
              <input
                type="checkbox"
                checked={preferences.inworldEnabled}
                onChange={(event) => update('inworldEnabled', event.target.checked)}
              />
              <span />
            </label>
          </div>
          <label className="pe-field">
            <span>Voice ID</span>
            <input
              value={preferences.inworldVoiceId}
              onChange={(event) => update('inworldVoiceId', event.target.value)}
              placeholder="Ashley"
            />
          </label>
          <div className="pe-security-note">
            <ShieldCheck size={17} />
            <p>
              {ttsServerStatus === 'ready'
                ? 'Server cache ready. Only missing chunks are synthesized; repeat playback reuses stored audio and timestamps.'
                : ttsServerStatus === 'missing-credential'
                ? 'Cache server is online. Set INWORLD_API_KEY in .env.local, then restart it to synthesize missing chunks.'
                : ttsServerStatus === 'offline'
                ? 'Cache server is offline. Start PageEcho with npm run dev.'
                : 'Checking the local cache server…'}
            </p>
          </div>
        </section>

        <section className="pe-settings-section">
          <div className="pe-setting-heading">
            <div>
              <h3>Nostr progress sync</h3>
              <p>Kind 30078 events preserve page, block, and word.</p>
            </div>
            <label className="pe-switch">
              <input
                type="checkbox"
                checked={preferences.syncEnabled}
                onChange={(event) => update('syncEnabled', event.target.checked)}
              />
              <span />
            </label>
          </div>
          <label className="pe-field">
            <span>Relay</span>
            <input
              value={preferences.relayUrl}
              onChange={(event) => update('relayUrl', event.target.value)}
              placeholder="wss://relay.example"
            />
          </label>
          <p className={`pe-inline-status is-${syncStatus}`}>
            {hasNostrSigner
              ? `Signer detected · ${syncStatus.replace('-', ' ')}`
              : 'No NIP-07 signer detected. Sync will remain off until one is available.'}
          </p>
        </section>
      </aside>
    </div>
  );
}
