const LEGACY_HOST = 'pageecho.dionlabs.ai';
const CANONICAL_ORIGIN = 'https://folioduet.dionlabs.ai';

interface PagesMiddlewareContext {
  request: Request;
  next(): Promise<Response>;
}

/** Keep old shared links useful while consolidating indexing on FolioDuet. */
export async function onRequest(context: PagesMiddlewareContext): Promise<Response> {
  const incoming = new URL(context.request.url);
  if (incoming.hostname !== LEGACY_HOST) return context.next();

  const destination = new URL(`${incoming.pathname}${incoming.search}`, CANONICAL_ORIGIN);
  return Response.redirect(destination, 308);
}
