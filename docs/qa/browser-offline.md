# Cold offline shell check

`npm run qa:offline` builds a separate production artifact with Firebase and sponsor-provider configuration disabled, then tests its first offline reload a previously opened synthetic PDF, and a failed-then-successful v3-to-v4 worker update in a fresh headless Chromium profile. No running Vite/backend session is needed.

```sh
FOLIODUET_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
FOLIODUET_CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
npm run qa:offline
```

The runner creates an ephemeral loopback HTTP server and uses it as an external-denying proxy. External HTTP and CONNECT requests are rejected; non-GET/HEAD requests are rejected; local API reads receive a synthetic503. Nothing is forwarded to a real service. The browser/server close in `finally`. For the generated PDF only, browser routes acknowledge synthetic API writes and return synthetic service failures; no backend receives those requests. No credentials, personal documents, persistent profiles, dependencies or browsers are installed.

After the service worker installs and controls the page, the runner clears Chromium's HTTP cache, stops the owned server, enables offline mode and reloads. PASS requires the actual Home import control, no JavaScript/module errors, and no broken images. This avoids a false pass from an ordinary warm HTTP cache. Inspect the screenshot too.

Artifacts default to ignored `local-evals/qa/browser-offline/`: isolated `dist/`, `build.log`, `report.json`, `offline-shell.png`, and `offline-book.png`, and `offline-after-update.png`. `FOLIODUET_QA_OUTPUT` changes that output directory. The ordinary production `dist/` is untouched.

`tools/qa/service-worker.test.mjs` covers entry precaching, lazy static assets, missing-asset behavior, static MIME/redirect rejection, failed install preservation, root-navigation fallback, API/auth/original/external/write exclusions, quota failure, and preservation of unrelated caches during shell-version cleanup. The `pageecho-shell-*` compatibility prefix remains unchanged.

This establishes a local cold offline shell, reopening one previously read generated PDF, and a worker update in a disposable profile. The update uses the frozen v3 fixture from c431fe1, forces one entry-asset404, confirms the old worker/cache survive, then retries v4 and verifies an unrelated cache survives and the updated shell boots offline. Physical PWA installation, installed-app updates, account state, additional book types and lazy WASM/provider dependencies, audio, and network recovery still require their own acceptance cases. This command does not certify the deployed site.
