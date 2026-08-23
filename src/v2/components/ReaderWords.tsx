import type { CSSProperties, ElementType, ReactNode } from 'react';
import {
  tokenizeBlock,
  type MarkdownBlock,
  type MarkdownInlineRun,
  type TextToken,
} from '../../hooks/useTTS';

interface TokenizedTextProps {
  text: string;
  inlineRuns?: MarkdownInlineRun[];
  tokens: TextToken[];
  blockIndex: number;
  activeBlockIndex: number;
  activeWordIndex: number;
  playbackState: 'idle' | 'buffering' | 'playing' | 'paused';
  onWordSelect: (blockIndex: number, wordIndex: number) => void;
  startOffset?: number;
}

function TokenizedText({
  text,
  inlineRuns,
  tokens,
  blockIndex,
  activeBlockIndex,
  activeWordIndex,
  playbackState,
  onWordSelect,
  startOffset = 0,
}: TokenizedTextProps) {
  const renderRun = (run: MarkdownInlineRun, runIndex: number, runStart: number) => {
    const runEnd = runStart + run.text.length;
    const children: ReactNode[] = [];
    let cursor = runStart;

    tokens.forEach((token) => {
      if (token.endIndex <= runStart || token.startIndex >= runEnd) return;
      if (token.startIndex > cursor) {
        children.push(text.slice(cursor, Math.min(token.startIndex, runEnd)));
      }
      const isActive = blockIndex === activeBlockIndex && token.elementIndex === activeWordIndex;
      children.push(
        <span
          key={`${blockIndex}-${runIndex}-${token.elementIndex}-${token.startIndex}`}
          className={`pe-word ${isActive ? `is-active is-${playbackState}` : ''}`}
          onClick={() => onWordSelect(blockIndex, token.elementIndex)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onWordSelect(blockIndex, token.elementIndex);
            }
          }}
        >
          {text.slice(Math.max(token.startIndex, runStart), Math.min(token.endIndex, runEnd))}
        </span>,
      );
      cursor = Math.min(token.endIndex, runEnd);
    });
    if (cursor < runEnd) children.push(text.slice(cursor, runEnd));

    let content: ReactNode = <>{children}</>;
    if (run.code) content = <code>{content}</code>;
    if (run.strong) content = <strong>{content}</strong>;
    if (run.emphasis) content = <em>{content}</em>;
    if (run.strikethrough) content = <del>{content}</del>;
    if (run.href) content = <a href={run.href} target="_blank" rel="noreferrer">{content}</a>;
    return <span key={`run-${runIndex}-${runStart}`}>{content}</span>;
  };

  const runs = inlineRuns?.length ? inlineRuns : [{ text }];
  let runStart = startOffset;
  return <>{runs.map((run, index) => {
    const rendered = renderRun(run, index, runStart);
    runStart += run.text.length;
    return rendered;
  })}</>;
}

interface ReaderWordsProps {
  markdownBlocks?: MarkdownBlock[];
  plainBlocks: string[];
  activeBlockIndex: number;
  activeWordIndex: number;
  playbackState: 'idle' | 'buffering' | 'playing' | 'paused';
  onWordSelect: (blockIndex: number, wordIndex: number) => void;
}

export function ReaderWords({
  markdownBlocks,
  plainBlocks,
  activeBlockIndex,
  activeWordIndex,
  playbackState,
  onWordSelect,
}: ReaderWordsProps) {
  if (markdownBlocks?.length) {
    return (
      <div className="pe-prose">
        {markdownBlocks.map((block, blockIndex) => {
          const isCurrent = activeBlockIndex === blockIndex;
          const tokenizedText = (
            <TokenizedText
              text={block.text}
              inlineRuns={block.inlineRuns}
              tokens={block.tokens}
              blockIndex={blockIndex}
              activeBlockIndex={activeBlockIndex}
              activeWordIndex={activeWordIndex}
              playbackState={playbackState}
              onWordSelect={onWordSelect}
            />
          );

          if (block.type === 'li') {
            const marker = block.listKind === 'ordered' ? `${block.listIndex ?? 1}.` : '•';
            return (
              <div
                key={`${block.type}-${blockIndex}-${block.globalWordOffset}`}
                className={`pe-markdown-list-item ${isCurrent ? 'is-current-block' : ''}`}
                style={{ '--pe-list-depth': block.listDepth ?? 0 } as CSSProperties}
              >
                <span className="pe-markdown-list-marker" aria-hidden="true">{marker}</span>
                <div>{tokenizedText}</div>
              </div>
            );
          }

          if (block.type === 'table-row' && block.tableCells?.length) {
            let nextCellSearchStart = 0;
            const firstTableRow = markdownBlocks[blockIndex - 1]?.type !== 'table-row';
            const lastTableRow = markdownBlocks[blockIndex + 1]?.type !== 'table-row';
            return (
              <div
                key={`${block.type}-${blockIndex}-${block.globalWordOffset}`}
                className={[
                  'pe-markdown-table-row',
                  block.tableHeader ? 'is-header' : '',
                  firstTableRow ? 'is-first' : '',
                  lastTableRow ? 'is-last' : '',
                  isCurrent ? 'is-current-block' : '',
                ].filter(Boolean).join(' ')}
                style={{ '--pe-table-columns': block.tableCells.length } as CSSProperties}
              >
                {block.tableCells.map((cellRuns, cellIndex) => {
                  const cellText = cellRuns.map((run) => run.text).join('');
                  const foundAt = cellText ? block.text.indexOf(cellText, nextCellSearchStart) : nextCellSearchStart;
                  const startOffset = foundAt >= 0 ? foundAt : nextCellSearchStart;
                  nextCellSearchStart = startOffset + cellText.length;
                  return (
                    <div className="pe-markdown-table-cell" key={`${blockIndex}-cell-${cellIndex}`}>
                      <TokenizedText
                        text={block.text}
                        inlineRuns={cellRuns}
                        tokens={block.tokens}
                        blockIndex={blockIndex}
                        activeBlockIndex={activeBlockIndex}
                        activeWordIndex={activeWordIndex}
                        playbackState={playbackState}
                        onWordSelect={onWordSelect}
                        startOffset={startOffset}
                      />
                    </div>
                  );
                })}
              </div>
            );
          }

          const tag: ElementType = block.type === 'code'
            ? 'pre'
            : block.type === 'table-row'
              ? 'div'
              : block.type;
          const Tag = tag;
          return (
            <Tag
              key={`${block.type}-${blockIndex}-${block.globalWordOffset}`}
              className={isCurrent ? 'is-current-block' : undefined}
            >
              {tokenizedText}
            </Tag>
          );
        })}
      </div>
    );
  }

  return (
    <div className="pe-prose">
      {plainBlocks.map((text, blockIndex) => (
        <p
          key={`${blockIndex}-${text.slice(0, 24)}`}
          className={activeBlockIndex === blockIndex ? 'is-current-block' : undefined}
        >
          <TokenizedText
            text={text}
            tokens={tokenizeBlock(text)}
            blockIndex={blockIndex}
            activeBlockIndex={activeBlockIndex}
            activeWordIndex={activeWordIndex}
            playbackState={playbackState}
            onWordSelect={onWordSelect}
          />
        </p>
      ))}
    </div>
  );
}
