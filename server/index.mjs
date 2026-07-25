import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TtsCache, TtsCacheError } from './tts-cache.mjs';

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

async function readJsonBody(request, maxBytes = 32 * 1024) {
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxBytes) {
      throw new TtsCacheError('Request body is too large.', 413, 'REQUEST_TOO_LARGE');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new TtsCacheError('Request body must be valid JSON.', 400, 'INVALID_JSON');
  }
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
  if (requestPath === '/') {
    relativePath = 'index.html';
  } else if (requestPath === '/v2/') {
    relativePath = path.join('v2', 'index.html');
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
    const fallback = requestPath.startsWith('/v2/')
      ? path.join(distDirectory, 'v2', 'index.html')
      : path.join(distDirectory, 'index.html');
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

export function createPageEchoServer({ cache, distDirectory }) {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');
    try {
      if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
        sendJson(response, 200, {
          ok: true,
          inworldConfigured: cache.isConfigured,
        });
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/tts/cache/stats') {
        sendJson(response, 200, await cache.getStats());
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/tts/synthesize') {
        const input = await readJsonBody(request);
        const result = await cache.synthesize(input);
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

      if (requestUrl.pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: 'NOT_FOUND', message: 'API route not found.' });
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' });
        return;
      }

      if (requestUrl.pathname === '/v2') {
        response.writeHead(307, { Location: '/v2/' });
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
      const statusCode = error instanceof TtsCacheError ? error.statusCode : 500;
      const code = error instanceof TtsCacheError ? error.code : 'INTERNAL_ERROR';
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      if (statusCode >= 500) console.error('[PageEcho server]', error);
      sendJson(response, statusCode, { error: code, message });
    }
  });
}

export async function startPageEchoServer() {
  const host = process.env.PAGEECHO_SERVER_HOST || '127.0.0.1';
  const port = Number(process.env.PAGEECHO_SERVER_PORT || 8787);
  const dataDir = path.resolve(
    projectDirectory,
    process.env.PAGEECHO_DATA_DIR || 'data',
  );
  const distDirectory = path.join(projectDirectory, 'dist');
  const cache = new TtsCache({
    dataDir,
    apiKey: process.env.INWORLD_API_KEY || '',
  });
  await cache.ready;
  const server = createPageEchoServer({ cache, distDirectory });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  console.log(`[PageEcho] Server listening on http://${host}:${port}`);
  console.log(`[PageEcho] Persistent TTS cache: ${dataDir}`);
  console.log(`[PageEcho] Inworld synthesis: ${cache.isConfigured ? 'configured' : 'not configured'}`);

  const shutdown = async () => {
    await new Promise((resolve) => server.close(resolve));
    await cache.close();
  };
  return { server, cache, shutdown };
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
