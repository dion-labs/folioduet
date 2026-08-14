import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { parsePageMarkdown } from '../../hooks/useTTS';
import { ReaderWords } from './ReaderWords';

describe('ReaderWords Markdown rendering', () => {
  it('renders formatting while word spans follow the flattened speech text', () => {
    const markdownBlocks = parsePageMarkdown(
      '**Bold words**, [the guide](https://example.com), and `system design`.',
    );
    const html = renderToStaticMarkup(
      <ReaderWords
        markdownBlocks={markdownBlocks}
        plainBlocks={[]}
        activeBlockIndex={0}
        activeWordIndex={1}
        playbackState="playing"
        onWordSelect={vi.fn()}
      />,
    );

    expect(html).toContain('<strong>');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('<code>');
    expect(html).not.toContain('**');
    expect(html).not.toContain('](https://example.com)');
    expect(html).toContain('is-active is-playing');
    expect(markdownBlocks[0].text).toBe('Bold words, the guide, and system design.');
  });
});
