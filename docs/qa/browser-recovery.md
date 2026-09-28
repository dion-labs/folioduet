# Isolated headless recovery checks

`npm run qa:browser` exercises the local React app in a new disposable headless Chromium profile. It imports a generated PDF with168 unique text markers and a generated public-sample ZIP, checks every marker before/after cache recovery and narrow reflow, verifies legacy mute, malformed/stored handoffs, stubbed speech/pause, malformed→valid PDF recovery, and quota-warning/retry behavior. A separate450-marker tall paragraph checks real clipping geometry and safe cache reconstruction. A two-file import with a synthetic second-file failure checks partial-success retention and retry. Library checks cover case-insensitive search, empty results, reopen, deletion cancellation, confirmed deletion/reload, and preservation of the other book's original bytes, and distinct original storage for repeated same-name imports. Short prose containing the filename is explicitly retained. Native library buttons are exercised with Enter and Space. The runner also rejects render-loop warnings and bounds synthetic provider attempts during idle and after pause/navigation.

No real accounts/documents are used. External requests and browser sockets are blocked, service workers are disabled, `/api/` requests are fulfilled with synthetic responses, and other non-GET/HEAD requests are blocked. Synthetic service-write acknowledgments are interceptor responses only; no backend receives them. Provider audio is not generated or played. A system-speech stub tracks volume/state; it does not certify speech timing or audibility.

## Run

Use Node22.18+ (the existing TypeScript PDF fixture is imported directly) and an available Playwright installation. Start a **new owned** local Vite server; do not restart another session:

```sh
VITE_FIREBASE_PROJECT_ID='' VITE_FIREBASE_API_KEY='' VITE_FIREBASE_APP_ID='' VITE_FISH_AUDIO_SPONSOR_KEY='' npm run dev:client -- --host 127.0.0.1 --port 5198 --strictPort
```

In another shell, set the path to Playwright's `index.mjs`. Use an installed supported Chromium binary or omit `FOLIODUET_CHROME_BIN` to use Playwright's installed Chromium:

```sh
FOLIODUET_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
FOLIODUET_CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
npm run qa:browser
```

The runner rejects non-localhost origins and verifies Firebase is disabled. Optional `FOLIODUET_QA_ORIGIN` changes the local origin; `FOLIODUET_QA_OUTPUT` changes the artifact directory. Default output is ignored `local-evals/qa/browser-recovery/`: `report.json`, reader/narrow/storage screenshots and `failure.png` on failure. Browser closes in a `finally` block. Stop only the owned Vite process when finished.

The report records Node/browser version, timestamp, results and blocked/stubbed request counts. A nonzero exit signals a failed assertion or browser error. Inspect screenshots as well as assertions. Physical Android/iOS, Safari/WebKit, actual audio/provider failures, real Firebase auth/sync, PWA updates and production deployment identity are separate acceptance gates. This local mode cannot certify them.

The synthetic quota test targets library writes. It does not claim every IndexedDB/browser-policy failure is handled. No dependencies or browser binaries are installed by this command.
