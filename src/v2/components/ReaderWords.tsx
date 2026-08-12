import type { ElementType, ReactNode } from 'react';
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
  let runStart = 0;
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
          const tag: ElementType = block.type === 'li' ? 'li' : block.type === 'code' ? 'pre' : block.type;
          const Tag = tag;
          return (
            <Tag
              key={`${block.type}-${blockIndex}-${block.globalWordOffset}`}
              className={activeBlockIndex === blockIndex ? 'is-current-block' : undefined}
            >
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
