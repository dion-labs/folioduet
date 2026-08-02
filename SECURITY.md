# Security

## Reporting a vulnerability

Please open a **private security advisory** on the GitHub repository, or email the maintainers via the [dion-labs](https://github.com/dion-labs) organization. Do not file public issues for credential leaks or exploitable auth/rules bugs.

## Secrets policy

| Secret | Shipping rule |
|--------|----------------|
| Inworld API keys | **Never** commit. BYOK only (user settings / server env). |
| Fish Audio sponsor key | May be injected at build time via `VITE_FISH_AUDIO_SPONSOR_KEY` while Fish remains free; treat as rotatable. |
| Firebase web config | Client-visible by design (API key + app id). Protect data with **Auth + Firestore rules**, authorized domains, and App Check if you need tighter abuse controls. |
| Cloudflare / GitHub tokens | Repository Actions secrets only. |

`.env` and `.env.local` are gitignored. Prefer copying from `.env.example`.
