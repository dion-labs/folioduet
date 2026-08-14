import { describe, expect, it } from 'vitest';
import { markdownToInlineRuns, markdownToSpeakableText, parsePageMarkdown } from './useTTS';

describe('Markdown speech cleanup', () => {
  it('keeps labels and content while removing inline syntax and destinations', () => {
    expect(markdownToSpeakableText(
      '**Bold** _idea_, [the guide](https://example.com), '
      + '![architecture diagram](figure.png), and `system design`.',
    )).toBe('Bold idea, the guide, architecture diagram, and system design.');

    expect(markdownToInlineRuns('**Bold** and [the guide](https://example.com)')).toEqual([
      { text: 'Bold', strong: true },
      { text: ' and ' },
      { text: 'the guide', href: 'https://example.com' },
    ]);
  });

  it('turns an AnyDoc-style Markdown table into plain speakable text', () => {
    const blocks = parsePageMarkdown([
      '### Project vocabulary',
      '',
      '| **Term** | [Meaning](https://example.com/meaning) |',
      '| --- | --- |',
      '| `system` | <b>design</b> |',
    ].join('\n'));

    expect(blocks.map((block) => block.text)).toEqual([
      'Project vocabulary',
      'Term Meaning system design',
    ]);
    expect(blocks[1].raw).toContain('| **Term** |');
    expect(blocks[1].inlineRuns.map((run) => run.text).join('')).toBe(blocks[1].text);
    expect(blocks[1].inlineRuns).toContainEqual({ text: 'Term', strong: true });
    expect(blocks[1].inlineRuns).toContainEqual({
      text: 'Meaning',
      href: 'https://example.com/meaning',
    });
    expect(blocks[1].inlineRuns).toContainEqual({ text: 'system', code: true });
  });

  it('drops structural rules, comments, and bare autolinks', () => {
    expect(markdownToSpeakableText([
      '<!-- extractor note -->',
      'Read this ~~draft~~.',
      '---',
      '<https://example.com/private-path>',
    ].join('\n'))).toBe('Read this draft.');
  });
});
