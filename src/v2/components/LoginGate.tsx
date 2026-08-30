import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { FolioDuetAvatar } from './FolioDuetAvatar';
import { GoogleSignInButton } from './GoogleSignInButton';

interface LoginGateProps {
  busy?: boolean;
  /** Busy-state copy. Defaults to a neutral session restore message. */
  busyMessage?: string;
  error?: string | null;
  onGoogleSignIn?: () => Promise<void>;
  onRetryGuest?: () => Promise<void>;
}

/** Splash while Firebase restores / mints a session; recoverable if anon fails. */
export function LoginGate({
  busy = false,
  busyMessage = 'Restoring your session…',
  error = null,
  onGoogleSignIn,
  onRetryGuest,
}: LoginGateProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const pending = busy || signingIn || retrying;
  const showRecovery = Boolean(error || localError) && !busy;

  const handleGoogle = async () => {
    if (!onGoogleSignIn) return;
    setSigningIn(true);
    setLocalError(null);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Google sign-in failed.');
      setSigningIn(false);
    }
  };

  const handleRetry = async () => {
    if (!onRetryGuest) return;
    setRetrying(true);
    setLocalError(null);
    try {
      await onRetryGuest();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Guest session failed.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="pe-app" data-theme="dark">
      <div className="pe-login">
        <div className="pe-login-card">
          <div className="pe-login-brand">
            <div className="pe-login-mark" aria-hidden="true">
              <FolioDuetAvatar />
            </div>
            <div className="pe-login-brand-text">
              <p className="pe-login-kicker">FOLIODUET</p>
              <h1>Read with your ears</h1>
            </div>
          </div>
          <p className="pe-login-copy">
            Import PDF books, listen with word-aligned speech, and keep your place privately synced across devices.
          </p>
          {showRecovery ? (
            <>
              <GoogleSignInButton
                className="pe-login-google"
                busy={signingIn}
                disabled={pending}
                onClick={() => void handleGoogle()}
              />
              {onRetryGuest ? (
                <button
                  type="button"
                  className="pe-login-btn pe-login-btn-secondary"
                  disabled={pending}
                  onClick={() => void handleRetry()}
                  style={{ marginTop: 10 }}
                >
                  {retrying ? <LoaderCircle size={18} className="pe-spin" /> : null}
                  {retrying ? 'Retrying…' : 'Retry as guest'}
                </button>
              ) : null}
              <p className="pe-login-error">{localError || error}</p>
              <p className="pe-login-note">
                Guest mode needs Anonymous sign-in enabled in Firebase Authentication.
              </p>
            </>
          ) : (
            <>
              <p className="pe-login-note" role="status">{busyMessage}</p>
              <div className="pe-login-btn pe-login-btn-static" aria-hidden="true">
                <LoaderCircle size={18} className="pe-spin" />
                Connecting…
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
