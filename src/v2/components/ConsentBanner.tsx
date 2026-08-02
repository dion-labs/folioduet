import { useEffect, useState } from 'react';
import {
  readAnalyticsConsent,
  writeAnalyticsConsent,
  type AnalyticsConsent,
} from '../firebase/consent';
import { isFirebaseConfigured } from '../firebase/app';

export function ConsentBanner() {
  const [decision, setDecision] = useState<AnalyticsConsent | null>(() => (
    typeof window === 'undefined' ? 'denied' : readAnalyticsConsent()
  ));

  useEffect(() => {
    setDecision(readAnalyticsConsent());
  }, []);

  if (!isFirebaseConfigured() || decision !== null) return null;

  return (
    <div className="pe-consent-banner" role="dialog" aria-label="Analytics consent">
      <p>
        We use privacy-friendly analytics to see what breaks and what helps.
        Necessary sign-in and library sync are unaffected.
      </p>
      <div className="pe-consent-actions">
        <button
          type="button"
          className="pe-button pe-button-secondary"
          onClick={() => {
            writeAnalyticsConsent('denied');
            setDecision('denied');
          }}
        >
          No thanks
        </button>
        <button
          type="button"
          className="pe-button pe-button-primary"
          onClick={() => {
            writeAnalyticsConsent('granted');
            setDecision('granted');
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
