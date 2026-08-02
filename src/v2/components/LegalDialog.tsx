import { X } from 'lucide-react';
import { LEGAL_DOCS, type LegalDocId } from '../legal';

interface LegalDialogProps {
  docId: LegalDocId | null;
  onClose: () => void;
}

export function LegalDialog({ docId, onClose }: LegalDialogProps) {
  if (!docId) return null;
  const doc = LEGAL_DOCS[docId];

  return (
    <div
      className="pe-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="pe-dialog pe-legal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
      >
        <div className="pe-dialog-header">
          <div>
            <span className="pe-eyebrow">PageEcho</span>
            <h2 id="legal-dialog-title">{doc.title}</h2>
          </div>
          <button className="pe-icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>

        <p className="pe-legal-updated">Last updated {doc.updated}</p>

        <div className="pe-legal-body">
          {doc.sections.map((section) => (
            <section key={section.heading} className="pe-legal-section">
              <h3>{section.heading}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph.slice(0, 48)}>{paragraph}</p>
              ))}
            </section>
          ))}
          <p className="pe-legal-disclaimer">
            This summary is product hygiene for an early open-source release, not formal legal advice.
          </p>
        </div>
      </section>
    </div>
  );
}
