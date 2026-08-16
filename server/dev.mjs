import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

// Run the unified single process dev server on port 5173.
// Host defaults to 0.0.0.0 in startPageEchoServer({ isDev: true }) so
// Tailscale / LAN clients (phone) can reach it unless PAGEECHO_SERVER_HOST is set.
process.env.NODE_ENV = 'development';
if (!process.env.PAGEECHO_SERVER_PORT) {
  process.env.PAGEECHO_SERVER_PORT = '5173';
}

const { startPageEchoServer } = await import(path.join(serverDir, 'index.mjs'));

const runtime = await startPageEchoServer({ isDev: true });

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log('[FolioDuet dev] Shutting down unified dev server...');
  try {
    await runtime.shutdown();
  } catch (error) {
    console.error('[FolioDuet dev] Error during shutdown:', error);
  }
  process.exit(0);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
