import { ListTree, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { LocatedChapter } from '../chapters';

interface ChapterListPanelProps {
  open: boolean;
  bookTitle: string;
  chapters: LocatedChapter[];
  currentChapterIndex: number;
  onJump: (pageIndex: number) => void;
  onClose: () => void;
}

export function ChapterListPanel({
  open,
  bookTitle,
  chapters,
  currentChapterIndex,
  onJump,
  onClose,
}: ChapterListPanelProps) {
  const currentRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    currentRef.current?.scrollIntoView({ block: 'center' });
  }, [open, currentChapterIndex]);

  if (!open) return null;

  return (
    <div
      className="pe-overlay pe-overlay-right"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="pe-chapters" role="dialog" aria-modal="true" aria-labelledby="chapters-title">
        <div className="pe-dialog-header">
          <div>
            <span className="pe-eyebrow">Contents</span>
            <h2 id="chapters-title">Chapters</h2>
            <p className="pe-chapters-book">{bookTitle}</p>
          </div>
          <button className="pe-icon-button" onClick={onClose} aria-label="Close chapters">
            <X size={19} />
          </button>
        </div>

        {chapters.length === 0 ? (
          <div className="pe-chapters-empty">
            <ListTree size={22} />
            <strong>No chapters detected yet</strong>
            <span>
              This edition doesn’t expose clear headings. For Mythical Man-Month, delete this book and
              re-import the improved sample (“Try Mythical Man-Month”) — the old *_Pages.zip dump has no chapter markers.
            </span>
          </div>
        ) : (
          <ol className="pe-chapter-list">
            {chapters.map((chapter, index) => {
              const active = index === currentChapterIndex;
              return (
                <li key={`${chapter.key}-${chapter.pageIndex}`}>
                  <button
                    type="button"
                    ref={active ? currentRef : undefined}
                    className={active ? 'is-active' : ''}
                    onClick={() => onJump(chapter.pageIndex)}
                  >
                    <span className="pe-chapter-title">{chapter.title}</span>
                    <span className="pe-chapter-page">p. {chapter.pageIndex + 1}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </aside>
    </div>
  );
}
