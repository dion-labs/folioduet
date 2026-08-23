const LEGACY_HOST = 'pageecho.dionlabs.ai';
const CANONICAL_ORIGIN = 'https://folioduet.dionlabs.ai';

interface PagesMiddlewareContext {
  request: Request;
  next(): Promise<Response>;
}

/** Keep old shared links useful while consolidating indexing on FolioDuet. */
export async function onRequest(context: PagesMiddlewareContext): Promise<Response> {
  const incoming = new URL(context.request.url);
  if (incoming.hostname !== LEGACY_HOST) {
    const response = await context.next();
    const headers = new Headers(response.headers);
    // Keep OAuth popups in the opener's browsing context group so Firebase can
    // reliably observe completion without weakening to the unsafe-none default.
    headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const destination = new URL(`${incoming.pathname}${incoming.search}`, CANONICAL_ORIGIN);
  return Response.redirect(destination, 308);
}
