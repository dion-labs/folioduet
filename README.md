# PageEcho

PageEcho is a bimodal PDF/Markdown reader with word-aligned neural speech,
reading progress, paired PDF views, and server-backed device sync (Tailscale-friendly).
The frontend is served at `/`.

## Local development

Requirements:

- Node.js 22.5 or newer (the server uses Node's built-in SQLite module).
- An Inworld Basic credential for new TTS synthesis.

Create a local server configuration:

```bash
cp .env.example .env.local
```

Set `INWORLD_API_KEY` in `.env.local`, then start the API/cache server and Vite
together:

```bash
npm run dev
```

Open <http://localhost:5173/>. The Inworld credential is read only by the
server; the frontend no longer reads or writes a browser-stored credential.

## Persistent TTS cache

The frontend retains a bounded look-ahead—it does not synthesize an entire
book. Each requested chunk is resolved by `POST /api/tts/synthesize`:

1. A deterministic key is derived from provider, model, voice, exact text,
   timestamp mode, encoding, and sample rate.
2. SQLite is checked for an existing entry.
3. On a hit, the MP3 and timestamp JSON are read from disk.
4. On a miss, the server calls Inworld once, writes both files atomically, and
   records their relative paths in SQLite.

Default data layout:

```text
data/
├── database/
│   └── pageecho.sqlite
└── tts/
    └── <voice>/
        └── <hash-prefix>/
            ├── <cache-key>.mp3
            └── <cache-key>.timestamps.json
```

Useful endpoints:

- `GET /api/health` — server and provider configuration status.
- `GET /api/tts/cache/stats` — entry count, audio bytes, cache hits, and latest
  access time.
- `POST /api/tts/synthesize` — cached on-demand synthesis.
- `GET /api/sync/bootstrap` — preferences, library metadata, active doc, secret status.
- `PUT /api/sync/preferences` / `PUT /api/sync/library` — cross-device reader state.
- `PUT /api/sync/secrets` — write-only API keys (never returned to clients).
- `PUT/GET /api/sync/documents/:id/{source,paired-pdf}` — imported file blobs.

Cached audio remains playable when provider keys are unavailable; only a
cache miss requires the credential.

## Device sync + PWA

Preferences, library metadata, reading progress fields, and imported source
files sync through the PageEcho server SQLite/data directory. API keys are
stored only on the server; clients see configured/not-configured and can
replace keys without ever reading them back.

The app ships a web app manifest + lightweight service worker so you can
“Add to Home Screen” / install it on a phone. Full Chrome install prompts
usually need HTTPS (Tailscale Serve or similar); Safari home-screen install
still works over your Tailscale HTTP URL.

## Production

Build and run the same server:

```bash
npm run build
npm start
```

The production server binds to `127.0.0.1:8787` by default and serves both the
API and built frontend. Configure `PAGEECHO_SERVER_HOST`,
`PAGEECHO_SERVER_PORT`, and `PAGEECHO_DATA_DIR` as needed.

`npm run dev` binds to `0.0.0.0:5173` so you can open the app from another
device on your Tailscale network (or LAN) at
`http://<tailscale-ip-or-magicdns>:5173`. Production stays on localhost by
default because the cache API does not implement multi-user authentication —
set `PAGEECHO_SERVER_HOST=0.0.0.0` only when Tailscale (or similar) is your
network boundary, or put auth/TLS in front before exposing it more widely.

The server stores TTS cache artifacts plus synced library/preferences/secrets
under `PAGEECHO_DATA_DIR`. Browser localStorage/IndexedDB remain a fast local
cache that is reconciled on load.
