import { describe, expect, it } from 'vitest';
import { markdownToSpeakableText, parsePageMarkdown } from './useTTS';

describe('Markdown speech cleanup', () => {
  it('keeps labels and content while removing inline syntax and destinations', () => {
    expect(markdownToSpeakableText(
      '**Bold** _idea_, [the guide](https://example.com), '
      + '![architecture diagram](figure.png), and `system design`.',
    )).toBe('Bold idea, the guide, architecture diagram, and system design.');
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
