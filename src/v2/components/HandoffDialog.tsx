import { Check, Copy, QrCode, Smartphone, X } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

interface HandoffDialogProps {
  open: boolean;
  url: string;
  bookTitle: string;
  pageLabel: string;
  requiresSignIn: boolean;
  /** Shared catalog sample — works for guests on any device. */
  catalogSample?: boolean;
  onSignIn?: () => void;
  onClose: () => void;
}

export function HandoffDialog({
  open,
  url,
  bookTitle,
  pageLabel,
  requiresSignIn,
  catalogSample = false,
  onSignIn,
  onClose,
}: HandoffDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !url) {
      setQrDataUrl(null);
      setQrError(null);
      setCopied(false);
      return;
    }

    let cancelled = false;
    setQrError(null);
    void QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      color: { dark: '#1c1e1b', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    }).catch((error: unknown) => {
      if (!cancelled) {
        setQrDataUrl(null);
        setQrError(error instanceof Error ? error.message : 'Could not generate QR code.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, url]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!open) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Fallback for older WebViews / denied clipboard permission.
      const input = document.createElement('textarea');
      input.value = url;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
    }
  };

  return (
    <div
      className="pe-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="pe-dialog pe-handoff-dialog" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
        <div className="pe-dialog-header">
          <div>
            <span className="pe-eyebrow">Continue elsewhere</span>
            <h2 id="handoff-title">Handoff to your phone</h2>
          </div>
          <button className="pe-icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>

        <p className="pe-handoff-lead">
          Scan the QR code or copy the link to keep reading
          {' '}
          <strong>{bookTitle}</strong>
          {' '}
          at
          {' '}
          {pageLabel}
          .
        </p>

        <div className="pe-handoff-qr-wrap">
          {qrDataUrl ? (
            <img className="pe-handoff-qr" src={qrDataUrl} alt="QR code to continue reading on another device" />
          ) : (
            <div className="pe-handoff-qr-fallback" aria-hidden="true">
              <QrCode size={36} />
              <span>{qrError || 'Preparing QR…'}</span>
            </div>
          )}
        </div>

        <div className="pe-handoff-link-row">
          <code className="pe-handoff-link" title={url}>{url}</code>
          <button
            type="button"
            className="pe-button pe-button-secondary pe-handoff-copy"
            onClick={() => { void copyLink(); }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {requiresSignIn ? (
          <div className="pe-handoff-warn">
            <Smartphone size={16} />
            <div>
              <strong>Sign in first for a reliable handoff</strong>
              <span>
                Guest libraries stay on this browser. Google sign-in syncs the book so your phone can open it.
              </span>
              {onSignIn ? (
                <button type="button" className="pe-button pe-button-primary" onClick={onSignIn}>
                  Sign in with Google
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="pe-dialog-note">
            {catalogSample
              ? 'No account needed for this sample — open the link on any phone or browser. Your place in the story is in the link.'
              : 'Open the link on a device signed into the same Google account. Progress is included in the link.'}
          </p>
        )}
      </section>
    </div>
  );
}
