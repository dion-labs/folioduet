import type { ElementType, ReactNode } from 'react';
import { tokenizeBlock, type MarkdownBlock, type TextToken } from '../../hooks/useTTS';

interface TokenizedTextProps {
  text: string;
  tokens: TextToken[];
  blockIndex: number;
  activeBlockIndex: number;
  activeWordIndex: number;
  playbackState: 'idle' | 'buffering' | 'playing' | 'paused';
  onWordSelect: (blockIndex: number, wordIndex: number) => void;
}

function TokenizedText({
  text,
  tokens,
  blockIndex,
  activeBlockIndex,
  activeWordIndex,
  playbackState,
  onWordSelect,
}: TokenizedTextProps) {
  const children: ReactNode[] = [];
  let cursor = 0;

  tokens.forEach((token) => {
    if (token.startIndex > cursor) {
      children.push(text.slice(cursor, token.startIndex));
    }

    const isActive = blockIndex === activeBlockIndex && token.elementIndex === activeWordIndex;
    children.push(
      <span
        key={`${blockIndex}-${token.elementIndex}-${token.startIndex}`}
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
        {token.word}
      </span>,
    );
    cursor = token.endIndex;
  });

  if (cursor < text.length) children.push(text.slice(cursor));
  return <>{children}</>;
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

