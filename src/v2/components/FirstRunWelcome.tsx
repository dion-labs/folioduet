import { BookOpen, LoaderCircle, Upload } from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';

interface FirstRunWelcomeProps {
  demoBusy: boolean;
  onPlayDemo: () => void;
  onUploadPdf: () => void;
  onGoogleSignIn?: () => void;
}

/** The empty-library experience: lead with value before asking for an account. */
export function FirstRunWelcome({
  demoBusy,
  onPlayDemo,
  onUploadPdf,
  onGoogleSignIn,
}: FirstRunWelcomeProps) {
  return (
    <section className="pe-welcome" aria-labelledby="pe-welcome-title">
      <div className="pe-welcome-copy">
        <span className="pe-eyebrow">Read and listen in sync</span>
        <h1 id="pe-welcome-title">Turn any PDF into an audiobook you can read along with.</h1>
        <p>
          Hear natural speech while FolioDuet follows every word on the page. Try it instantly,
          then bring a PDF when you’re ready.
        </p>
        <div className="pe-welcome-actions">
          <button
            type="button"
            className="pe-button pe-button-primary pe-demo-button"
            onClick={onPlayDemo}
            disabled={demoBusy}
            data-activation-action="play-demo"
          >
            {demoBusy ? <LoaderCircle className="pe-spin" size={17} /> : <BookOpen size={17} />}
            {demoBusy ? 'Opening the demo…' : 'Play the demo'}
          </button>
          <button
            type="button"
            className="pe-button pe-button-secondary"
            onClick={onUploadPdf}
            disabled={demoBusy}
            data-activation-action="upload-pdf"
          >
            <Upload size={17} /> Upload your PDF
          </button>
        </div>
        <p className="pe-welcome-assurance">
          No account required. Your original PDF stays on this device.
        </p>
        {onGoogleSignIn ? (
          <div className="pe-welcome-account">
            <span>Want your library and reading position on every device?</span>
            <GoogleSignInButton onClick={onGoogleSignIn} />
          </div>
        ) : null}
      </div>
      <div className="pe-welcome-visual" aria-hidden="true">
        <div className="pe-visual-card pe-visual-card-back">
          <span>04</span>
          <p>“The reader’s attention moves with the voice.”</p>
        </div>
        <div className="pe-visual-card pe-visual-card-front">
          <div className="pe-visual-line" />
          <div className="pe-visual-line is-short" />
          <p>
            Ideas become clearer when text and sound{' '}
            <span className="pe-visual-highlight">move together</span>
          </p>
          <div className="pe-visual-wave"><i /><i /><i /><i /><i /><i /><i /></div>
        </div>
      </div>
    </section>
  );
}
