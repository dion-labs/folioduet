import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FirstRunWelcome } from './FirstRunWelcome';

describe('FirstRunWelcome', () => {
  it('leads with the concrete outcome and demo action', () => {
    const markup = renderToStaticMarkup(
      <FirstRunWelcome demoBusy={false} onPlayDemo={() => undefined} onUploadPdf={() => undefined} />,
    );

    expect(markup).toContain('Turn any PDF into an audiobook you can read along with.');
    expect(markup).toContain('FolioDuet follows every word on the page.');
    expect(markup).toContain('Play the demo');
    expect(markup).toContain('data-activation-action="play-demo"');
    expect(markup).toContain('Upload your PDF');
    expect(markup).toContain('No account required');
    expect(markup.indexOf('Play the demo')).toBeLessThan(markup.indexOf('Upload your PDF'));
  });

  it('communicates progress and disables both competing actions while opening the demo', () => {
    const markup = renderToStaticMarkup(
      <FirstRunWelcome demoBusy onPlayDemo={() => undefined} onUploadPdf={() => undefined} />,
    );

    expect(markup).toContain('Opening the demo…');
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });
});
