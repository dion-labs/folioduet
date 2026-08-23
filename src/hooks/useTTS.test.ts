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
      'Term Meaning',
      'system design',
    ]);
    expect(blocks[1].type).toBe('table-row');
    expect(blocks[1].tableHeader).toBe(true);
    expect(blocks[1].tableCells).toHaveLength(2);
    expect(blocks[1].raw).toContain('| **Term** |');
    expect(blocks[1].inlineRuns.map((run) => run.text).join('')).toBe(blocks[1].text);
    expect(blocks[1].inlineRuns).toContainEqual({ text: 'Term', strong: true });
    expect(blocks[1].inlineRuns).toContainEqual({
      text: 'Meaning',
      href: 'https://example.com/meaning',
    });
    expect(blocks[2].inlineRuns).toContainEqual({ text: 'system', code: true });
  });

  it('drops structural rules, comments, and bare autolinks', () => {
    expect(markdownToSpeakableText([
      '<!-- extractor note -->',
      'Read this ~~draft~~.',
      '---',
      '<https://example.com/private-path>',
    ].join('\n'))).toBe('Read this draft.');
  });

  it('handles CommonMark headings, reference links, and nested ordered lists', () => {
    const blocks = parsePageMarkdown([
      'A setext title',
      '==============',
      '',
      '3. Read **carefully**',
      '4. Open [the guide][guide]',
      '   - Keep _notes_',
      '',
      '[guide]: https://example.com/guide',
    ].join('\n'));

    expect(blocks.map((block) => block.text)).toEqual([
      'A setext title',
      'Read carefully',
      'Open the guide',
      'Keep notes',
    ]);
    expect(blocks.map((block) => block.type)).toEqual(['h1', 'li', 'li', 'li']);
    expect(blocks[1]).toMatchObject({ listKind: 'ordered', listIndex: 3, listDepth: 0 });
    expect(blocks[2]).toMatchObject({ listKind: 'ordered', listIndex: 4, listDepth: 0 });
    expect(blocks[3]).toMatchObject({ listKind: 'unordered', listDepth: 1 });
    expect(markdownToSpeakableText('[the guide][guide]\n\n[guide]: https://example.com')).toBe('the guide');
  });

  it('does not send raw Markdown delimiters or URLs to speech', () => {
    const spoken = markdownToSpeakableText([
      '## **Release notes**',
      '',
      '> Read _the guide_, not <https://example.com/private-path>.',
      '',
      '- Use `safe mode`.',
      '',
      '---',
    ].join('\n'));

    expect(spoken).toBe('Release notes Read the guide, not . Use safe mode.');
    expect(spoken).not.toMatch(/[#*_`>[\]|]|https?:\/\//);
  });
});
