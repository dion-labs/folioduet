import { BookOpen, FileArchive, FileText, Plus, Search, Trash2 } from 'lucide-react';
import { calculateProgress, formatRelativeDate } from '../documents';
import type { LibraryDocument } from '../types';

interface LibrarySidebarProps {
  documents: LibraryDocument[];
  activeDocumentId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (document: LibraryDocument) => void;
  onImport: () => void;
  onDelete: (document: LibraryDocument) => void;
}

export function LibrarySidebar({
  documents,
  activeDocumentId,
  query,
  onQueryChange,
  onSelect,
  onImport,
  onDelete,
}: LibrarySidebarProps) {
  const filteredDocuments = documents
    .filter((document) => document.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside className="pe-library">
      <div className="pe-library-header">
        <div>
          <span className="pe-eyebrow">Your collection</span>
          <h2>Library</h2>
        </div>
        <button className="pe-icon-button pe-icon-button-accent" onClick={onImport} aria-label="Add books">
          <Plus size={18} />
        </button>
      </div>

      <label className="pe-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search your library"
          aria-label="Search your library"
        />
      </label>

      <div className="pe-library-list">
        {filteredDocuments.length ? filteredDocuments.map((document) => {
          const progress = calculateProgress(
            document.currentPageIndex,
            document.totalPages,
            document.activeWordIndex,
          );
          const isActive = document.id === activeDocumentId;

          return (
            <article
              key={document.id}
              className={`pe-book-card ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelect(document)}
            >
              <div className={`pe-cover pe-cover-${document.kind === 'pdf' ? 'blue' : 'coral'}`}>
                {document.kind === 'pdf' ? <FileText size={20} /> : <FileArchive size={20} />}
                <span>{document.kind === 'pdf' ? 'PDF' : 'MD'}</span>
              </div>
              <div className="pe-book-details">
                <h3>{document.name}</h3>
                <p>
                  Page {document.currentPageIndex + 1} of {document.totalPages}
                  <span aria-hidden="true"> · </span>
                  {formatRelativeDate(document.updatedAt)}
                </p>
                <div className="pe-progress-track" aria-label={`${Math.round(progress)} percent read`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
              {!document.isSample && (
                <button
                  className="pe-book-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(document);
                  }}
                  aria-label={`Delete ${document.name}`}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </article>
          );
        }) : (
          <div className="pe-library-empty">
            <BookOpen size={28} />
            <strong>{query ? 'No matching books' : 'Your shelf is ready'}</strong>
            <p>{query ? 'Try another title.' : 'Add a PDF or a ZIP of Markdown pages to begin.'}</p>
            {!query && <button className="pe-text-button" onClick={onImport}>Import your first book</button>}
          </div>
        )}
      </div>

      <div className="pe-library-footer">
        <span>{documents.length} {documents.length === 1 ? 'title' : 'titles'}</span>
        <span>Stored on this device</span>
      </div>
    </aside>
  );
}

