# Agent guide — FolioDuet

This file is for coding agents (and humans) setting up **FolioDuet on a user’s own infrastructure**, not the Dion Labs shared Firebase project. FolioDuet was formerly PageEcho.

## What this project is

FolioDuet is a React + Vite SPA: PDF/Markdown reading with word-aligned TTS, guest or Google auth, and per-user Firestore sync. Originals stay in IndexedDB on the import device; processed page markdown syncs under `pageecho/{uid}/…`.

The canonical host is `folioduet.dionlabs.ai`; keep `pageecho.dionlabs.ai` attached so the Pages middleware can permanently redirect old links. Keep the existing `github.com/dion-labs/pageecho` repository slug. The `pageecho` Firestore namespace, `pageecho-*` browser-storage keys, `pageecho-shell-*` service-worker caches, and `X-PageEcho-TTS-Cache` API header are legacy compatibility contracts; do not rename them without a separately designed migration.

Production shape: **static `dist/` on Cloudflare Pages + Firebase**. The Node server under `server/` is optional for local TTS caching / single-user sync.

## Greenfield setup (new Firebase project)

Do **not** reuse `dionlabs-fe92e` unless you are deploying the official Dion Labs instance.

1. **Create a Firebase project** in the Google console.
2. **Enable Authentication → Google** (and Anonymous if you want guest sessions).
3. **Create a Web app** and copy the config into `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

   Fill `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, optional `VITE_FIREBASE_MEASUREMENT_ID`.

4. **Authorized domains**: add `localhost` and your production host (e.g. `pageecho.example.com`).
5. **Firestore**: create the default database.
6. **Rules**: deploy owner-only FolioDuet rules. For a **dedicated** project (no Dion Labs blog collections), use:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function isSignedIn() { return request.auth != null; }
       function isOwner(uid) { return isSignedIn() && request.auth.uid == uid; }

       match /pageecho/{uid} {
         allow read, write: if uid != 'catalog' && isOwner(uid);
         match /secrets/{docId} { allow read, write: if uid != 'catalog' && isOwner(uid); }
         match /library/{documentId} {
           allow read, write: if uid != 'catalog' && isOwner(uid);
           match /pages/{pageKey} { allow read, write: if uid != 'catalog' && isOwner(uid); }
         }
       }

       match /pageecho/catalog/{document=**} {
         allow read: if true;
         allow create, update: if isSignedIn();
         allow delete: if false;
       }
     }
   }
   ```

   The repo’s `firestore.rules` also contains **legacy Dion Labs site** collections (`blog_stats`, etc.) for the shared official project — **omit those** on a fresh project.

7. Update `.firebaserc` `default` to the new project id before `firebase deploy --only firestore:rules`.
8. **Vite Auth helper proxy** (local redirect login): in `vite.config.ts`, point `/__/auth` at `https://<YOUR_PROJECT>.firebaseapp.com` (not `dionlabs-fe92e`).
9. **TTS**
   - Fish: set `VITE_FISH_AUDIO_SPONSOR_KEY` for a shared key, or leave empty and use in-app BYOK.
   - Inworld: BYOK only in the client; never put Inworld keys in `VITE_*` env.
10. **Footer links**: set `VITE_GITHUB_REPO_URL` / `VITE_GITHUB_SPONSORS_URL` if not using dion-labs defaults.
11. Run `npm install && npm run dev:client`, sign in, import a small PDF, confirm another browser profile with the same Google account sees processed pages.

## Cloudflare Pages (user’s account)

1. In Cloudflare: **Workers & Pages → Create → Import a repository** → this GitHub repo.
2. Settings: project name e.g. `pageecho`, production branch `main`, framework **Vite**, build `npm run build`, output `dist`.
3. Add Production env vars: all needed `VITE_FIREBASE_*`, `VITE_FISH_AUDIO_SPONSOR_KEY` (or `FISH_AUDIO_API_KEY`), optional `VITE_GITHUB_REPO_URL`, `VITE_GITHUB_SPONSORS_URL`.
4. After create: disable automatic **preview / PR** deployments so only `main` ships.
5. Attach a custom domain; add that host to Firebase Auth **Authorized domains**.
6. Set `VITE_FIREBASE_AUTH_DOMAIN` to `<project>.firebaseapp.com` (not the custom domain). Production Pages has **no** `/__/auth` proxy; rewriting authDomain to the site host makes Google sign-in open the SPA (guest page). Local Vite still proxies `/__/auth` in `npm run dev`.
7. Fish TTS on Pages uses `functions/api/tts/synthesize.ts` (not the Node server). Without the sponsor/BYOK key on the Function, playback falls back to system voice.

## Data model (short)

```text
pageecho/{uid}                    preferences, activeDocumentId, profile
pageecho/{uid}/secrets/keys       BYOK TTS keys (owner only)
pageecho/{uid}/library/{id}       book metadata + progress
pageecho/{uid}/library/{id}/pages/{pageKey}   processed markdown
pageecho/catalog/**               shared samples / optional baked audio
```

Details: ask for `RESEARCH/PAGEECHO_FIREBASE_DATA_MODEL.md` in the Dion Labs nest, or read `src/v2/firebase/paths.ts`.

## Commands agents should know

| Command | Use |
|---------|-----|
| `npm run dev:client` | SPA against Firebase |
| `npm run dev` | SPA + local Node proxy |
| `npm test` | Vitest |
| `npm run build` | `dist/` for Pages |
| `firebase deploy --only firestore:rules` | Rules (correct project!) |

## Do not

- Commit `.env.local`, Inworld keys, or Fish keys into git history.
- Deploy the full Dion Labs `firestore.rules` file to an unrelated Firebase project without removing legacy blog/landing matches.
- Expose the Node sync server on the public internet without auth — it is single-trust local tooling.
- Claim the app is “created” on a user’s machine until Firebase rules + Auth domains are actually configured and a smoke import works.
