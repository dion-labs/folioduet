# PageEcho

A calmer way to **read and listen**. Import PDF books, keep your place, and follow every word with neural speech — privately synced across your devices.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-dion--labs-ea4aaa.svg)](https://github.com/sponsors/dion-labs)

## Features

- Word-aligned playback (Fish Audio sponsor key or BYOK; Inworld BYOK)
- Google sign-in + per-user library isolation (Firebase Auth + Firestore)
- Guest mode for try-before-login
- Progress sync; **original PDFs stay on the import device**
- Phone handoff (copy link + QR)
- PWA-friendly shell
- Open source under Dion Labs ([sponsor](https://github.com/sponsors/dion-labs))

## Quick start (local)

Requirements: **Node.js 22.5+**

```bash
cp .env.example .env.local
# Fill Firebase web config (see AGENTS.md) — or leave PROJECT_ID empty for Node-only sync
npm install
npm run dev:client          # Firebase / static SPA path
# or: npm run dev           # Vite + optional local Node TTS/sync proxy
```

Open http://localhost:5173/

```bash
npm test
npm run build               # static site → dist/ (Cloudflare Pages)
```

## Architecture (ship shape)

```text
Cloudflare Pages (static SPA)
        │
        ▼
Firebase Auth (Google) + Firestore
  pageecho/{uid}/library|pages|secrets|prefs
        │
Browser
  ├── IndexedDB originals (import device only)
  ├── Fish / Inworld TTS from the client
  └── Analytics only after consent
```

The optional Node server (`npm run dev` / `npm start`) is a **legacy/local** TTS cache + sync helper. Production open-source hosting is the static client + Firebase.

## Configuration

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_FIREBASE_*` | Build / `.env.local` | Firebase web app (public client config) |
| `VITE_FISH_AUDIO_SPONSOR_KEY` | Build secret | Shared Fish key while free (optional) |
| `VITE_GITHUB_REPO_URL` | Build | Footer GitHub link |
| `VITE_GITHUB_SPONSORS_URL` | Build | Footer Sponsor link |
| `INWORLD_API_KEY` | Server `.env.local` only | Local Node TTS proxy — never ship in the client |

See [`.env.example`](./.env.example), [`AGENTS.md`](./AGENTS.md) (fresh Firebase setup), and [`SECURITY.md`](./SECURITY.md).

## Deploy

Production is **Cloudflare Pages** connected to this GitHub repo:

- Framework: Vite · build: `npm run build` · output: `dist`
- Production branch: `main`
- Put `VITE_*` values in the Pages project **Environment variables** (Production)
- `VITE_FIREBASE_AUTH_DOMAIN` must be `<project>.firebaseapp.com` (not the custom domain)
- `VITE_FISH_AUDIO_SPONSOR_KEY` (or `FISH_AUDIO_API_KEY`) is required for Fish TTS — the SPA calls `/api/tts/synthesize`, served by a **Pages Function** (Fish’s API has no browser CORS)
- Disable automatic **preview / PR** deployments in Pages settings if you only want `main` live

Attach a custom domain, then add that host to Firebase Auth authorized domains.

## License

[MIT](./LICENSE) © Dion Labs
