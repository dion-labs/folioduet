import { BookOpen, X } from 'lucide-react';
import type { HandoffTarget } from '../handoff';

interface HandoffResumeDialogProps {
  open: boolean;
  target: HandoffTarget;
  bookTitle: string;
  onContinue: () => void;
  onDismiss: () => void;
}

export function HandoffResumeDialog({
  open,
  target,
  bookTitle,
  onContinue,
  onDismiss,
}: HandoffResumeDialogProps) {
  if (!open) return null;

  return (
    <div
      className="pe-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        className="pe-dialog pe-handoff-resume-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="handoff-resume-title"
      >
        <div className="pe-dialog-header">
          <div>
            <span className="pe-eyebrow">Continue from handoff</span>
            <h2 id="handoff-resume-title">Pick up where you left off?</h2>
          </div>
          <button className="pe-icon-button" onClick={onDismiss} aria-label="Dismiss">
            <X size={19} />
          </button>
        </div>

        <div className="pe-handoff-resume-card">
          <span className="pe-handoff-resume-icon" aria-hidden="true">
            <BookOpen size={20} />
          </span>
          <div>
            <strong>{bookTitle}</strong>
            <span>Page {target.pageIndex + 1}</span>
          </div>
        </div>

        <div className="pe-handoff-resume-actions">
          <button type="button" className="pe-button pe-button-secondary" onClick={onDismiss}>
            Not now
          </button>
          <button type="button" className="pe-button pe-button-primary" onClick={onContinue}>
            Continue reading
          </button>
        </div>
      </section>
    </div>
  );
}
