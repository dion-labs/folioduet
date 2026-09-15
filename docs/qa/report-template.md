# FolioDuet QA report

Copy this template to `local-evals/qa/<run>/report.md` (or commit a sanitized report explicitly). Do not replace test descriptions with historical results.

## Identity

- UTC start/end:
- Candidate commit and dirty files:
- Deployed commit / Pages deployment ID / URL:
- Canonical URL / Firebase project:
- OS, browser versions, physical devices, viewport / PWA:
- Node/npm versions; extraction and TTS configurations:
- QA fixture manifest and private evidence directory:
- Previous known-good deployment and rollback method:

## Scope and result

- Requested scope:
- Verdict: FULL CERTIFICATION / SCOPED VERIFICATION / FAILED / BLOCKED
- Exact scope of “no regression observed”:
- Baseline defects:
- Newly found defects:
- Remaining risks / browser-device gaps:

## Automated evidence

| Command | Candidate SHA | Exit/result and counts | Evidence |
| --- | --- | --- | --- |
| `npm ci` | | | |
| `npm test` | | | |
| `npm run build` | | | |
| `git diff --check` | | | |
| `npm run qa:live` (after deploy) | | | |
| Relevant emulator suite(s) | | | |

List skipped tests and why. Record warnings separately from failures. State which commands inspected local code and which inspected production.

## Scenario results

Add one row for **every** applicable catalogue ID and required browser/device combination. Unexecuted rows are NOT RUN; never leave their status implicit. For an area outside a scoped run, enumerate its excluded IDs/ranges below.

| Case ID / environment | Fixture | Steps/observed result | PASS / FAIL / BLOCKED / NOT RUN / N/A | Evidence + UTC |
| --- | --- | --- | --- | --- |
| HOST-01 | | | NOT RUN | |
| HOST-02 | | | NOT RUN | |
| HOST-03 | | | NOT RUN | |
| START-01 | | | NOT RUN | |
| AUTH-01 | | | NOT RUN | |
| AUTH-02 | | | NOT RUN | |
| AUTH-07 | | | NOT RUN | |
| IMP-01 | | | NOT RUN | |
| IMP-02 | | | NOT RUN | |
| READ-01 | | | NOT RUN | |
| TTS-01 | | | NOT RUN | |
| SYNC-01 | | | NOT RUN | |

- Excluded/unexecuted case IDs and reason:
- N/A cases and deployment-capability justification:
- BLOCKED cases and required access/device/input:

## Firebase/hosting regression evidence

- Deployed public config and authoritative config agree (where inspected):
- Required authorized hosts present; unrelated entries preserved:
- Google/guest providers checked by configuration and/or actual successful flow:
- Google final signed-in state + reload confirmed (not just popup open):
- Account isolation / sign-out result:
- Custom-domain deployment and lazy worker/WASM asset validation:
- Fresh and cached-session outcomes:

## Follow-up and sign-off

- Issues with reproduction steps, severity, expected/actual behavior:
- Fixes and rerun evidence:
- Cleanup performed (only authorized disposable data):
- Final certification statement bounded to the tested build and matrix:
