import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GoogleSignInButton } from './GoogleSignInButton';

describe('GoogleSignInButton', () => {
  it('renders a recognizable Google call to action', () => {
    const markup = renderToStaticMarkup(<GoogleSignInButton />);

    expect(markup).toContain('Continue with Google');
    expect(markup).toContain('pe-google-button-logo');
    expect(markup).toContain('#4285f4');
    expect(markup).toContain('#34a853');
    expect(markup).toContain('#fbbc05');
    expect(markup).toContain('#ea4335');
  });

  it('communicates and disables the busy state', () => {
    const markup = renderToStaticMarkup(<GoogleSignInButton busy />);

    expect(markup).toContain('Connecting…');
    expect(markup).toContain('disabled=""');
  });
});
