import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteEntry = path.join(projectDirectory, 'node_modules', 'vite', 'bin', 'vite.js');
const children = [
  spawn(process.execPath, [path.join(projectDirectory, 'server', 'index.mjs')], {
    cwd: projectDirectory,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [viteEntry], {
    cwd: projectDirectory,
    env: process.env,
    stdio: 'inherit',
  }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 250);
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('[PageEcho dev]', error);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[PageEcho dev] A process exited (${signal || code}).`);
      stop(code || 1);
    }
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
