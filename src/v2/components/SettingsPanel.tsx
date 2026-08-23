import { ChevronDown, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FISH_AUDIO_REFERRAL_URL } from '../projectLinks';
import type {
  DeviceSyncStatus,
  PdfExtractionStatus,
  ReaderPreferences,
  TtsServerStatus,
} from '../types';
import { FishVoicePicker } from './FishVoicePicker';

interface SettingsPanelProps {
  open: boolean;
  preferences: ReaderPreferences;
  pdfExtractionStatus: PdfExtractionStatus | null;
  inworldServerStatus: TtsServerStatus;
  fishAudioServerStatus: TtsServerStatus;
  deviceSyncStatus: DeviceSyncStatus;
  accountLabel?: string | null;
  isAnonymous?: boolean;
  cloudSync?: boolean;
  onSignOut?: () => Promise<void>;
  onChange: (preferences: ReaderPreferences) => void;
  onSaveSecrets: (input: {
    inworldApiKey?: string;
    fishAudioApiKey?: string;
    clearInworld?: boolean;
    clearFishAudio?: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

export function SettingsPanel({
  open,
  preferences,
  pdfExtractionStatus,
  inworldServerStatus,
  fishAudioServerStatus,
  deviceSyncStatus,
  accountLabel = null,
  isAnonymous = false,
  cloudSync = false,
  onSignOut,
  onChange,
  onSaveSecrets,
  onClose,
}: SettingsPanelProps) {
  const [inworldDraft, setInworldDraft] = useState('');
  const [fishDraft, setFishDraft] = useState('');
  const [secretBusy, setSecretBusy] = useState(false);
  const [secretMessage, setSecretMessage] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setInworldDraft('');
      setFishDraft('');
      setSecretMessage(null);
    }
  }, [open]);

  if (!open) return null;

  const update = <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) => {
    onChange({ ...preferences, [key]: value });
  };

  const handleInworldChange = (checked: boolean) => {
    onChange({
      ...preferences,
      inworldEnabled: checked,
      fishAudioEnabled: checked ? false : preferences.fishAudioEnabled,
    });
  };

  const handleFishAudioChange = (checked: boolean) => {
    onChange({
      ...preferences,
      fishAudioEnabled: checked,
      inworldEnabled: checked ? false : preferences.inworldEnabled,
    });
  };

  const getRemainingFreeTime = () => {
    const endDate = new Date('2026-09-01T00:00:00Z');
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    if (diffTime <= 0) {
      return 'Free period has ended';
    }
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} days remaining`;
  };

  const vaultLabel = cloudSync ? 'your account' : 'the server';
  const fishConfigured = fishAudioServerStatus === 'ready';
  const inworldConfigured = inworldServerStatus === 'ready';

  const saveCredential = async (provider: 'inworld' | 'fish-audio') => {
    setSecretBusy(true);
    setSecretMessage(null);
    try {
      if (provider === 'inworld') {
        if (!inworldDraft.trim()) {
          await onSaveSecrets({ clearInworld: true });
          setSecretMessage(`Inworld key cleared from ${vaultLabel}.`);
        } else {
          await onSaveSecrets({ inworldApiKey: inworldDraft.trim() });
          setSecretMessage(`Inworld key saved to ${vaultLabel}.`);
        }
        setInworldDraft('');
      } else if (!fishDraft.trim()) {
        await onSaveSecrets({ clearFishAudio: true });
        setSecretMessage(`Fish Audio key cleared from ${vaultLabel}.`);
        setFishDraft('');
      } else {
        await onSaveSecrets({ fishAudioApiKey: fishDraft.trim() });
        setSecretMessage(`Fish Audio key saved to ${vaultLabel}.`);
        setFishDraft('');
      }
    } catch (error) {
      setSecretMessage(error instanceof Error ? error.message : 'Could not save credential.');
    } finally {
      setSecretBusy(false);
    }
  };

  const syncLabel = cloudSync
    ? deviceSyncStatus === 'synced'
      ? 'Library and preferences sync privately under your FolioDuet account.'
      : deviceSyncStatus === 'syncing'
        ? 'Syncing your FolioDuet account…'
        : deviceSyncStatus === 'offline'
          ? 'Cloud sync unavailable — changes stay on this device until you reconnect.'
          : deviceSyncStatus === 'error'
            ? 'Last sync failed — retry by changing a setting or reloading.'
            : 'Waiting to sync your FolioDuet account.'
    : deviceSyncStatus === 'synced'
      ? 'Library & preferences sync with this FolioDuet server (Tailscale-ready).'
      : deviceSyncStatus === 'syncing'
        ? 'Syncing with the FolioDuet server…'
        : deviceSyncStatus === 'offline'
          ? 'Server offline — changes stay on this device until it reconnects.'
          : deviceSyncStatus === 'error'
            ? 'Last sync failed — retry by changing a setting or reloading.'
            : 'Waiting to sync with the FolioDuet server.';

  const pdfStatusLabel = pdfExtractionStatus?.state === 'extracting'
    ? `Extracting current PDF with ${pdfExtractionStatus.requested === 'anydoc' ? 'AnyDoc' : 'FolioDuet'}…`
    : pdfExtractionStatus?.state === 'fallback'
      ? 'AnyDoc could not process this PDF. FolioDuet was used instead.'
      : pdfExtractionStatus?.state === 'error'
        ? 'The current PDF could not be extracted.'
        : pdfExtractionStatus?.used === 'anydoc'
          ? 'Current PDF successfully extracted with AnyDoc.'
          : pdfExtractionStatus?.used === 'pageecho'
            ? 'Current PDF extracted with FolioDuet.'
            : 'Open a locally stored PDF to see which extractor was used.';

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
              <h3>Device sync</h3>
              <p>{syncLabel}</p>
            </div>
          </div>
          <p className={`pe-inline-status is-${deviceSyncStatus === 'synced' ? 'connected' : deviceSyncStatus}`}>
            Status · {deviceSyncStatus}
          </p>
          {cloudSync && accountLabel ? (
            <p className="pe-settings-account">
              {isAnonymous ? accountLabel : `Signed in as ${accountLabel}`}
            </p>
          ) : null}
          {cloudSync && isAnonymous ? (
            <p className="pe-settings-guest-note">
              Without Google sign-in, clearing site data or switching browsers can lose synced books.
              The shared sample story stays available to everyone.
            </p>
          ) : null}
          {cloudSync && onSignOut ? (
            <button
              type="button"
              className="pe-button pe-button-secondary"
              style={{ marginTop: 12 }}
              onClick={() => void onSignOut()}
            >
              Sign out
            </button>
          ) : null}
        </section>

        <section className="pe-settings-section">
          <div className="pe-setting-heading">
            <div>
              <h3>PDF text extraction</h3>
              <p>Choose how FolioDuet turns local PDFs into its reading stream.</p>
            </div>
          </div>
          <div className="pe-segmented pe-segmented-wide">
            <button
              type="button"
              className={preferences.pdfExtractor === 'pageecho' ? 'is-active' : ''}
              onClick={() => update('pdfExtractor', 'pageecho')}
            >
              FolioDuet
            </button>
            <button
              type="button"
              className={preferences.pdfExtractor === 'anydoc' ? 'is-active' : ''}
              onClick={() => update('pdfExtractor', 'anydoc')}
            >
              AnyDoc beta
            </button>
          </div>
          <p className="pe-settings-hint">
            AnyDoc runs locally and may improve columns, headings, tables, and page-number cleanup.
            If it fails, FolioDuet automatically uses its original extractor.
          </p>
          <p className={`pe-inline-status ${
            pdfExtractionStatus?.state === 'ready' ? 'is-connected' : ''
          }`}>
            {pdfStatusLabel}
          </p>
        </section>

        <section className="pe-settings-section">
          <div className="pe-setting-heading">
            <div>
              <h3>Audio buffering</h3>
              <p>Choose how many upcoming text segments neural TTS prepares.</p>
            </div>
          </div>
          <div className="pe-segmented pe-segmented-wide">
            {([1, 3, 5] as const).map((count) => (
              <button
                key={count}
                type="button"
                className={preferences.ttsBufferAhead === count ? 'is-active' : ''}
                onClick={() => update('ttsBufferAhead', count)}
              >
                {count} ahead
              </button>
            ))}
          </div>
          <p className="pe-settings-hint">
            More buffering can reduce pauses between passages, but uses more data and TTS requests.
          </p>
        </section>

        <section className="pe-settings-section">
          <button
            type="button"
            className={`pe-advanced-toggle ${advancedOpen ? 'is-open' : ''}`}
            onClick={() => setAdvancedOpen((value) => !value)}
            aria-expanded={advancedOpen}
          >
            <div>
              <h3>Advanced voice</h3>
              <p>Fish Audio (default) and optional Inworld BYOK.</p>
            </div>
            <ChevronDown size={18} aria-hidden="true" />
          </button>

          {advancedOpen && (
            <div className="pe-advanced-body">
              <div className="pe-advanced-block">
                <div className="pe-setting-heading">
                  <div>
                    <h3>Fish Audio S2.1 Pro</h3>
                    <p>Default neural voice with word-level timestamps.</p>
                  </div>
                  <label className="pe-switch">
                    <input
                      type="checkbox"
                      checked={preferences.fishAudioEnabled}
                      onChange={(event) => handleFishAudioChange(event.target.checked)}
                    />
                    <span />
                  </label>
                </div>
                <FishVoicePicker
                  voiceId={preferences.fishAudioVoiceId}
                  onChange={(next) => update('fishAudioVoiceId', next)}
                />
                <label className="pe-field">
                  <span>Fish Audio API Key</span>
                  <input
                    type="password"
                    value={fishDraft}
                    onChange={(event) => setFishDraft(event.target.value)}
                    placeholder={fishConfigured ? '••••••••••••••••' : 'Your fish audio API key…'}
                    autoComplete="off"
                  />
                </label>
                <p className="pe-settings-hint">
                  Need a key?{' '}
                  <a href={FISH_AUDIO_REFERRAL_URL} target="_blank" rel="noreferrer">
                    Get one from Fish Audio
                  </a>
                </p>
                {fishDraft.trim() ? (
                  <button
                    type="button"
                    className="pe-button pe-button-secondary pe-secret-action"
                    disabled={secretBusy}
                    onClick={() => void saveCredential('fish-audio')}
                  >
                    Save Fish Audio key
                  </button>
                ) : null}
                {fishConfigured && !fishDraft.trim() ? (
                  <button
                    type="button"
                    className="pe-button pe-button-secondary pe-secret-action"
                    disabled={secretBusy}
                    onClick={() => void saveCredential('fish-audio')}
                  >
                    Clear Fish Audio key
                  </button>
                ) : null}
                {preferences.fishAudioEnabled && (
                  <div className="pe-cooldown-note">
                    <span>🐝</span>
                    <span>
                      <strong>Free S2.1 Pro active:</strong> {getRemainingFreeTime()} (expires Sept 1, 2026)
                    </span>
                  </div>
                )}
              </div>

              <div className="pe-advanced-block">
                <div className="pe-setting-heading">
                  <div>
                    <h3>Inworld neural voice</h3>
                    <p>Optional alternative TTS. Requires your own Inworld key.</p>
                  </div>
                  <label className="pe-switch">
                    <input
                      type="checkbox"
                      checked={preferences.inworldEnabled}
                      onChange={(event) => handleInworldChange(event.target.checked)}
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
                <label className="pe-field">
                  <span>Inworld API Key / Signature</span>
                  <input
                    type="password"
                    value={inworldDraft}
                    onChange={(event) => setInworldDraft(event.target.value)}
                    placeholder={inworldConfigured ? '••••••••••••••••' : 'Basic YXBpLWtleS1zaWduYXR1cmU…'}
                    autoComplete="off"
                  />
                </label>
                {inworldDraft.trim() ? (
                  <button
                    type="button"
                    className="pe-button pe-button-secondary pe-secret-action"
                    disabled={secretBusy}
                    onClick={() => void saveCredential('inworld')}
                  >
                    Save Inworld key
                  </button>
                ) : null}
                {inworldConfigured && !inworldDraft.trim() ? (
                  <button
                    type="button"
                    className="pe-button pe-button-secondary pe-secret-action"
                    disabled={secretBusy}
                    onClick={() => void saveCredential('inworld')}
                  >
                    Clear Inworld key
                  </button>
                ) : null}
              </div>

              {secretMessage && <p className="pe-inline-status is-connected">{secretMessage}</p>}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
