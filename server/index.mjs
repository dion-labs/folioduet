import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TtsCache, TtsCacheError } from './tts-cache.mjs';
import { SyncStore } from './sync-store.mjs';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(serverDirectory, '..');

function loadEnvironmentFile(filePath) {
  if (!existsSync(filePath)) return;
  const contents = readFileSync(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvironmentFile(path.join(projectDirectory, '.env'));
loadEnvironmentFile(path.join(projectDirectory, '.env.local'));

function sendJson(response, statusCode, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(body);
}

async function readBodyBuffer(request, maxBytes = 32 * 1024) {
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxBytes) {
      throw new TtsCacheError('Request body is too large.', 413, 'REQUEST_TOO_LARGE');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(request, maxBytes = 32 * 1024) {
  const buffer = await readBodyBuffer(request, maxBytes);
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new TtsCacheError('Request body must be valid JSON.', 400, 'INVALID_JSON');
  }
}

function httpError(error) {
  if (error instanceof TtsCacheError) return error;
  if (error && typeof error.statusCode === 'number') {
    return new TtsCacheError(error.message, error.statusCode, error.code || 'SYNC_ERROR');
  }
  return error;
}

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
]);

async function sendStaticFile(response, distDirectory, requestPath) {
  let relativePath;
  if (requestPath === '/' || requestPath === '/v2' || requestPath === '/v2/') {
    relativePath = 'index.html';
  } else {
    relativePath = requestPath.replace(/^\/+/, '');
  }

  let filePath = path.resolve(distDirectory, relativePath);
  const distPrefix = `${path.resolve(distDirectory)}${path.sep}`;
  if (!filePath.startsWith(distPrefix)) return false;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
  } catch {
    const fallback = path.join(distDirectory, 'index.html');
    filePath = path.resolve(fallback);
    try {
      const fallbackStat = await stat(filePath);
      if (!fallbackStat.isFile()) return false;
    } catch {
      return false;
    }
  }

  const body = await readFile(filePath);
  response.writeHead(200, {
    'Content-Type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream',
    'Content-Length': body.length,
  });
  response.end(body);
  return true;
}

export function createPageEchoServer({
  cache,
  syncStore,
  distDirectory,
  viteDevServer,
  getViteDevServer,
}) {
  const resolveViteDevServer = () =>
    (typeof getViteDevServer === 'function' ? getViteDevServer() : null) || viteDevServer || null;

  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');
    try {
      if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
        sendJson(response, 200, {
          ok: true,
          inworldConfigured: cache.isConfigured,
          fishAudioConfigured: cache.isFishAudioConfigured,
        });
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/tts/cache/stats') {
        sendJson(response, 200, await cache.getStats());
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/tts/synthesize') {
        const input = await readJsonBody(request);
        // Prefer server-persisted credentials; ignore client-supplied keys once configured.
        const result = await cache.synthesize({
          ...input,
          apiKey: cache.isConfigured ? undefined : input.apiKey,
          fishAudioApiKey: cache.isFishAudioConfigured ? undefined : input.fishAudioApiKey,
        });
        sendJson(
          response,
          200,
          {
            audioContent: result.audioContent,
            timestampInfo: result.timestampInfo,
            cacheKey: result.cacheKey,
            cacheStatus: result.cacheStatus,
          },
          { 'X-PageEcho-TTS-Cache': result.cacheStatus.toUpperCase() },
        );
        return;
      }

      if (syncStore) {
        if (request.method === 'GET' && requestUrl.pathname === '/api/sync/bootstrap') {
          sendJson(response, 200, await syncStore.bootstrap());
          return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/api/sync/preferences') {
          sendJson(response, 200, await syncStore.getPreferences());
          return;
        }

        if (request.method === 'PUT' && requestUrl.pathname === '/api/sync/preferences') {
          const input = await readJsonBody(request);
          sendJson(response, 200, await syncStore.setPreferences(input));
          return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/api/sync/library') {
          sendJson(response, 200, {
            documents: await syncStore.getLibrary(),
            activeDocumentId: await syncStore.getActiveDocumentId(),
          });
          return;
        }

        if (request.method === 'PUT' && requestUrl.pathname === '/api/sync/library') {
          const input = await readJsonBody(request, 2 * 1024 * 1024);
          const saved = await syncStore.setLibrary(input.documents);
          const activeDocumentId = Object.prototype.hasOwnProperty.call(input, 'activeDocumentId')
            ? await syncStore.setActiveDocumentId(input.activeDocumentId)
            : await syncStore.getActiveDocumentId();
          sendJson(response, 200, { ...saved, activeDocumentId });
          return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/api/sync/secrets') {
          sendJson(response, 200, await syncStore.getSecretsStatus());
          return;
        }

        if (request.method === 'PUT' && requestUrl.pathname === '/api/sync/secrets') {
          const input = await readJsonBody(request);
          await syncStore.setSecrets(input);
          const values = await syncStore.getSecretValues();
          cache.setCredentials({
            inworldApiKey: values.inworldApiKey,
            fishAudioApiKey: values.fishAudioApiKey,
          });
          // Env fallbacks still win when UI clears a key that was only env-provided.
          if (!values.inworldApiKey && process.env.INWORLD_API_KEY) {
            cache.setCredentials({ inworldApiKey: process.env.INWORLD_API_KEY });
          }
          if (!values.fishAudioApiKey && process.env.FISH_AUDIO_API_KEY) {
            cache.setCredentials({ fishAudioApiKey: process.env.FISH_AUDIO_API_KEY });
          }
          sendJson(response, 200, {
            inworldConfigured: cache.isConfigured,
            fishAudioConfigured: cache.isFishAudioConfigured,
          });
          return;
        }

        const documentBlobMatch = requestUrl.pathname.match(
          /^\/api\/sync\/documents\/([^/]+)\/(source|paired-pdf)$/,
        );
        if (documentBlobMatch) {
          const documentId = decodeURIComponent(documentBlobMatch[1]);
          const kind = documentBlobMatch[2];

          if (request.method === 'GET') {
            const blob = await syncStore.getDocumentBlob(documentId, kind);
            if (!blob) {
              sendJson(response, 404, { error: 'NOT_FOUND', message: 'Document blob not found.' });
              return;
            }
            response.writeHead(200, {
              'Content-Type': blob.contentType || 'application/octet-stream',
              'Content-Length': blob.buffer.length,
              'Content-Disposition': `attachment; filename="${encodeURIComponent(blob.fileName || kind)}"`,
              'Cache-Control': 'no-store',
            });
            response.end(blob.buffer);
            return;
          }

          if (request.method === 'PUT') {
            const buffer = await readBodyBuffer(request, 80 * 1024 * 1024);
            const fileName = requestUrl.searchParams.get('fileName') || kind;
            const contentType = request.headers['content-type'] || 'application/octet-stream';
            sendJson(
              response,
              200,
              await syncStore.saveDocumentBlob(documentId, kind, buffer, { fileName, contentType }),
            );
            return;
          }
        }

        const documentMatch = requestUrl.pathname.match(/^\/api\/sync\/documents\/([^/]+)$/);
        if (documentMatch && request.method === 'DELETE') {
          const documentId = decodeURIComponent(documentMatch[1]);
          sendJson(response, 200, await syncStore.deleteDocument(documentId));
          return;
        }
      }

      if (requestUrl.pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: 'NOT_FOUND', message: 'API route not found.' });
        return;
      }

      const activeViteDevServer = resolveViteDevServer();
      if (activeViteDevServer) {
        activeViteDevServer.middlewares(request, response);
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' });
        return;
      }

      if (requestUrl.pathname === '/v2' || requestUrl.pathname === '/v2/') {
        response.writeHead(301, { Location: '/' });
        response.end();
        return;
      }

      if (!(await sendStaticFile(response, distDirectory, requestUrl.pathname))) {
        sendJson(response, 404, {
          error: 'FRONTEND_NOT_BUILT',
          message: 'Frontend build not found. Run npm run build first.',
        });
      }
    } catch (error) {
      const normalized = httpError(error);
      const statusCode = normalized instanceof TtsCacheError ? normalized.statusCode : 500;
      const code = normalized instanceof TtsCacheError ? normalized.code : 'INTERNAL_ERROR';
      const message = normalized instanceof Error ? normalized.message : 'Unexpected server error.';
      if (statusCode >= 500) console.error('[FolioDuet server]', normalized);
      sendJson(response, statusCode, { error: code, message });
    }
  });
}

export async function startPageEchoServer({ isDev = false } = {}) {
  // Dev defaults to all interfaces for Tailscale/phone access; prod stays loopback.
  const host = process.env.PAGEECHO_SERVER_HOST || (isDev ? '0.0.0.0' : '127.0.0.1');
  const port = Number(process.env.PAGEECHO_SERVER_PORT || 8787);
  const dataDir = path.resolve(
    projectDirectory,
    process.env.PAGEECHO_DATA_DIR || 'data',
  );
  const distDirectory = path.join(projectDirectory, 'dist');
  const syncStore = new SyncStore({ dataDir });
  await syncStore.ready;

  const storedSecrets = await syncStore.getSecretValues();
  const cache = new TtsCache({
    dataDir,
    apiKey: storedSecrets.inworldApiKey || process.env.INWORLD_API_KEY || '',
    fishAudioApiKey: storedSecrets.fishAudioApiKey || process.env.FISH_AUDIO_API_KEY || '',
  });
  await cache.ready;

  // Create the HTTP server first so Vite HMR can attach to the same listener
  // (needed when opening the app from a phone over Tailscale / LAN).
  let viteDevServer;
  const server = createPageEchoServer({
    cache,
    syncStore,
    distDirectory,
    getViteDevServer: () => viteDevServer,
  });

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    viteDevServer = await createViteServer({
      server: {
        middlewareMode: true,
        // Share this HTTP listener so HMR works through Tailscale HTTPS (:8443)
        // as well as plain http://localhost:5173.
        hmr: { server },
        allowedHosts: ['.ts.net', 'localhost', '127.0.0.1'],
      },
      appType: 'spa',
    });
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const publicHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  console.log(`[FolioDuet] Server listening on http://${host}:${port}`);
  if (host === '0.0.0.0' || host === '::') {
    console.log(`[FolioDuet] Local:     http://localhost:${port}`);
    console.log(`[FolioDuet] Tailscale: http://<your-tailscale-ip-or-magicdns>:${port}`);
  } else {
    console.log(`[FolioDuet] Open http://${publicHost}:${port}`);
  }
  console.log(`[FolioDuet] Persistent TTS cache: ${dataDir}`);
  console.log(`[FolioDuet] Inworld synthesis: ${cache.isConfigured ? 'configured' : 'not configured'}`);
  console.log(`[FolioDuet] Fish Audio synthesis: ${cache.isFishAudioConfigured ? 'configured' : 'not configured'}`);

  const shutdown = async () => {
    await new Promise((resolve) => server.close(resolve));
    if (viteDevServer) {
      await viteDevServer.close();
    }
    await cache.close();
    await syncStore.close();
  };
  return { server, cache, syncStore, shutdown };
}

const isMainModule = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule) {
  const runtime = await startPageEchoServer();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await runtime.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
