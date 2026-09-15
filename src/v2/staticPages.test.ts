import { describe, expect, it } from 'vitest';
import { renderLegalPage, renderNotFoundPage } from './staticPages';
import { LEGAL_DOCS } from './legal';

describe('static public routes', () => {
  it.each(['privacy', 'terms'] as const)('publishes shared %s text without requiring JavaScript', (id) => {
    const html = renderLegalPage(id);
    expect(html).toContain(`<h1>${LEGAL_DOCS[id].title}</h1>`);
    expect(html).toContain(`https://folioduet.dionlabs.ai/${id}/`);
    for (const section of LEGAL_DOCS[id].sections) expect(html).toContain(section.heading);
    expect(html).not.toContain('<script');
  });
  it('gives unknown links a useful noindex page', () => {
    const html = renderNotFoundPage();
    expect(html).toContain('<h1>Page not found</h1>');
    expect(html).toContain('content="noindex"');
    expect(html).toContain('href="/"');
  });
});
