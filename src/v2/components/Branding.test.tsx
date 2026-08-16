import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';
import { LoginGate } from './LoginGate';

describe('FolioDuet branding on transitional screens', () => {
  it('brands the session-loading screen as FolioDuet', () => {
    const markup = renderToStaticMarkup(
      <LoginGate busy busyMessage="Starting a private guest session…" />,
    );

    expect(markup).toContain('FOLIODUET');
    expect(markup).not.toContain('PAGE ECHO');
  });

  it('brands the fatal-error screen as FolioDuet', () => {
    const boundary = new AppErrorBoundary({ children: null });
    boundary.state = { error: new Error('Test failure') };
    const markup = renderToStaticMarkup(boundary.render());

    expect(markup).toContain('FOLIODUET');
    expect(markup).not.toContain('PAGE ECHO');
  });
});
