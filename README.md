# PageEcho

PageEcho is a bimodal PDF/Markdown reader with word-aligned Inworld speech,
reading progress, paired PDF views, and Nostr progress sync. The professional
frontend is served at `/v2/`.

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

Open <http://localhost:5173/v2/>. The Inworld credential is read only by the
server; the V2 frontend no longer reads or writes a browser-stored credential.

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

- `GET /api/health` — server and Inworld configuration status.
- `GET /api/tts/cache/stats` — entry count, audio bytes, cache hits, and latest
  access time.
- `POST /api/tts/synthesize` — cached on-demand synthesis.

Cached audio remains playable when `INWORLD_API_KEY` is unavailable; only a
cache miss requires the credential.

## Production

Build and run the same server:

```bash
npm run build
npm start
```

The production server binds to `127.0.0.1:8787` by default and serves both the
API and built frontend. Configure `PAGEECHO_SERVER_HOST`,
`PAGEECHO_SERVER_PORT`, and `PAGEECHO_DATA_DIR` as needed.

The localhost bind is intentional because the cache API does not implement
multi-user authentication. Put authentication and TLS in front of the server
before exposing it on a network.

This server migration covers generated TTS audio and timestamp artifacts.
Library metadata and imported source documents remain device-local in the
browser for now; they are not silently uploaded or migrated.
