import { LEGAL_DOCS, type LegalDocId } from './legal';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function page(title: string, body: string, path?: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — FolioDuet</title>
${path ? `<link rel="canonical" href="https://folioduet.dionlabs.ai${path}">` : '<meta name="robots" content="noindex">'}
<style>html{color-scheme:light dark}body{font:18px/1.65 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:3rem 1.25rem;background:#11151b;color:#e9edf4}a{color:#b7d4ff}h1{line-height:1.2}h2{font-size:1.25rem;margin-top:2rem}nav{display:flex;gap:1.25rem;flex-wrap:wrap}a:focus-visible{outline:3px solid #e4b860;outline-offset:4px}.eyebrow{letter-spacing:.1em;color:#bac7d8}</style>
</head><body><header><a href="/">FolioDuet</a></header><main>${body}</main><footer><nav aria-label="Footer"><a href="/">Open reader</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="https://dionlabs.ai/privacy">Lab privacy</a></nav></footer></body></html>`;
}

/** Static routes and in-app dialogs use the same approved legal text. */
export function renderLegalPage(id: LegalDocId): string {
  const doc = LEGAL_DOCS[id];
  return page(doc.title, `<h1>${escapeHtml(doc.title)}</h1><p>Updated ${escapeHtml(doc.updated)}</p>${doc.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.body.map((text) => `<p>${escapeHtml(text)}</p>`).join('')}</section>`).join('')}`, `/${id}/`);
}

export function renderNotFoundPage(): string {
  return page('Page not found', '<p class="eyebrow">404</p><h1>Page not found</h1><p>This link does not point to a FolioDuet page. Your library is available in the reader.</p><p><a href="/">Return to FolioDuet</a></p>');
}
