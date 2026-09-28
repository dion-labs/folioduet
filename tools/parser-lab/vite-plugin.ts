import type { Plugin } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Development-only access to fixed filenames in the curated private corpus. */
export function parserLabFixtures(): Plugin {
  return {
    name: 'local-parser-lab-fixtures',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';
        if (!pathname.startsWith('/__parser-lab/')) return next();
        const host = req.headers.host?.split(':')[0];
        if (!['127.0.0.1', 'localhost'].includes(host ?? '') || req.method !== 'GET'
          || (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host)) {
          res.statusCode = 403; res.end('Local reference access requires localhost.'); return;
        }
        const relative = pathname.slice('/__parser-lab/'.length);
        if (relative !== 'manifest.json' && relative !== 'source.pdf' && !/^page-\d{3}\/(source\.png|source\.pdf|reference\.md)$/.test(relative)) {
          res.statusCode = 404; res.end(); return;
        }
        try {
          const bytes = await readFile(resolve('local-evals/parser-lab', relative));
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Type', relative.endsWith('.png') ? 'image/png' : relative.endsWith('.pdf') ? 'application/pdf' : relative.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8');
          res.end(bytes);
        } catch { res.statusCode = 404; res.end('No local reference set installed.'); }
      });
    },
  };
}
