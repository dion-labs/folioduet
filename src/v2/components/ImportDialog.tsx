import { FileArchive, FileText, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';

interface ImportDialogProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onImport: (files: File[]) => void;
}

export function ImportDialog({ open, busy, error, onClose, onImport }: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  if (!open) return null;

  const acceptFiles = (list: FileList | null) => {
    if (!list?.length) return;
    onImport(Array.from(list));
  };

  return (
    <div className="pe-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="pe-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="pe-dialog-header">
          <div>
            <span className="pe-eyebrow">Add to library</span>
            <h2 id="import-title">Import books</h2>
          </div>
          <button className="pe-icon-button" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={19} />
          </button>
        </div>

        <button
          className={`pe-dropzone ${dragging ? 'is-dragging' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFiles(event.dataTransfer.files);
          }}
          disabled={busy}
        >
          <span className="pe-dropzone-icon"><Upload size={22} /></span>
          <strong>{busy ? 'Preparing your books…' : 'Drop PDF or Markdown ZIP files here'}</strong>
          <span>or choose files from your device</span>
        </button>
        <input
          ref={inputRef}
          className="pe-visually-hidden"
          type="file"
          accept=".pdf,.zip,application/pdf,application/zip"
          multiple
          onChange={(event) => acceptFiles(event.target.files)}
        />

        <div className="pe-import-types">
          <div><FileText size={18} /><span><strong>PDF</strong>Original layout with extracted text</span></div>
          <div><FileArchive size={18} /><span><strong>Markdown ZIP</strong>One numbered .md file per page</span></div>
        </div>

        {error && <p className="pe-form-error" role="alert">{error}</p>}
        <p className="pe-dialog-note">Files stay in your browser’s local database. You can pair an original PDF after importing a Markdown book.</p>
      </section>
    </div>
  );
}

