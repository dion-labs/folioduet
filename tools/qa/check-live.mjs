import { pathToFileURL } from 'node:url';

export function checkAuthorizedDomains(config, requiredDomains) {
  const authorized = new Set(config.authorizedDomains ?? []);
  const missing = requiredDomains.filter((domain) => !authorized.has(domain));
  if (missing.length) throw new Error(`Firebase authorized domains missing: ${missing.join(', ')}`);
}

/** Read-only release smoke: inspect the config actually served to browsers. */
export async function checkLive({
  origin = 'https://folioduet.dionlabs.ai',
  legacyOrigin = 'https://pageecho.dionlabs.ai',
  requiredDomains = ['folioduet.dionlabs.ai', 'boxie.dionlabs.ai'],
  projectNumber = '263927058814',
  fetchImpl = fetch,
} = {}) {
  const passed = [];
  const get = async (url, options = {}) => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000), ...options });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${new URL(url).pathname}`);
    return response;
  };
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    passed.push(message);
  };
  const root = await get(`${origin}/`);
  const html = await root.text();
  assert(html.includes('FolioDuet'), 'Production homepage contains FolioDuet');
  assert(root.headers.get('cross-origin-opener-policy') === 'same-origin-allow-popups',
    'Production preserves the OAuth popup opener');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], origin)).filter((url) => url.origin === origin);
  assert(scripts.length > 0, 'Production HTML references an application bundle');
  let bundles = '';
  for (const url of scripts) {
    const response = await get(url);
    const text = await response.text();
    assert(!response.headers.get('content-type')?.includes('text/html') && !/^\s*<!doctype/i.test(text),
      `Application script is executable content: ${url.pathname}`);
    bundles += text;
  }
  const keys = [...new Set(bundles.match(/AIza[\w-]{35}/g) ?? [])];
  assert(keys.length === 1, 'Deployed bundle has one identifiable Firebase web configuration');
  const configResponse = await get(`https://identitytoolkit.googleapis.com/v1/projects?key=${keys[0]}`, {
    headers: { Referer: `${origin}/` },
  });
  const config = await configResponse.json();
  assert(config.projectId === projectNumber, 'Deployed Firebase project matches the official project');
  checkAuthorizedDomains(config, requiredDomains);
  passed.push('Firebase authorizes every required shared-project domain');
  assert(bundles.includes('dionlabs-fe92e.firebaseapp.com'), 'Deployed bundle includes the Firebase-hosted auth helper');
  for (const path of ['/pdf-to-audiobook/', '/read-and-listen-to-pdf/']) {
    const text = await (await get(`${origin}${path}`)).text();
    assert(text.includes('FolioDuet') && /<h1\b/i.test(text), `Public landing page loads: ${path}`);
  }
  const manifest = await (await get(`${origin}/manifest.webmanifest`)).json();
  assert(Boolean(manifest.name && manifest.icons?.length), 'Install manifest is valid and has icons');
  for (const icon of manifest.icons) {
    const response = await get(new URL(icon.src, origin));
    assert(response.headers.get('content-type')?.startsWith('image/'), `Manifest icon loads: ${icon.src}`);
  }
  const sw = await get(`${origin}/sw.js`);
  assert(!sw.headers.get('content-type')?.includes('text/html') && (await sw.text()).includes('fetch'),
    'Service worker is JavaScript');
  const redirect = await fetchImpl(`${legacyOrigin}/?qa=redirect`, {
    redirect: 'manual', signal: AbortSignal.timeout(20_000),
  });
  assert(redirect.status === 308 && redirect.headers.get('location') === `${origin}/?qa=redirect`,
    'Legacy hostname permanently redirects and preserves the query');
  return { origin, checkedAt: new Date().toISOString(), passed,
    scope: 'Read-only HTTP/config checks; not a Google login, speech, browser, or full QA certification.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await checkLive(), null, 2));
  } catch (error) {
    // Never print request URLs containing a web API key or raw provider payloads.
    console.error(`Live QA failed: ${error instanceof Error ? error.message.replace(/AIza[\w-]{35}/g, '[redacted]') : 'unknown error'}`);
    process.exitCode = 1;
  }
}
