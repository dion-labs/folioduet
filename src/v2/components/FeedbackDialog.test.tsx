import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeedbackDialog } from './FeedbackDialog';

describe('FeedbackDialog', () => {
  it('asks for an abandonment reason without requiring an account or message', () => {
    const markup = renderToStaticMarkup(
      <FeedbackDialog
        open
        context={{
          surface: 'home',
          documentKind: 'none',
          isSample: false,
          voiceMode: 'fish',
        }}
        onSubmit={async () => undefined}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('What got in your way?');
    expect(markup).toContain("I couldn&#x27;t get started");
    expect(markup).toContain("The voice wasn&#x27;t right");
    expect(markup).toContain('Something broke');
    expect(markup).toContain('Optional');
    expect(markup).toContain('No Google account required');
    expect(markup).toContain('disabled=""');
  });
});
