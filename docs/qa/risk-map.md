# Risk and automation map

Companion to [the canonical case registry](README.md#4-scenario-catalogue), preserving its stable IDs, procedures, expected outcomes and fixture definitions. Updated 2026-09-22. This map describes coverage, not execution results. Burn results belong in [the dated ledger](../TOKEN_BURN_2026-09-22.md).

P0: account/privacy loss, lost content or unusable core path. P1: recovery, platform compatibility and degraded operation. P2: presentation/discovery. Run P0 first, then changed-feature and recovery cases; never treat partial automation as a manual PASS. All tests use synthetic/disposable fixtures.

| Stable cases | Risk | Automated coverage (partial unless noted) | Required manual/live remainder |
| --- | --- | --- | --- |
| HOST-01–04 | P0 | `npm run qa:live`, middleware and staticPages tests: assets, redirects, legal content, missing routes | Exact deployment identity, fresh/cached browser render, lazy imports |
| START-01–02 | P0 | auth, storage, FirstRunWelcome tests | Fresh guest, slow restored Google session, no wrong-account flash |
| AUTH-01–08 | P0 | auth/authUrl/config/GoogleSignInButton tests; live authorized-domain probe; isolated rules tests | Canonical Google completion, guest link/merge, cancellation/blocking/retry, concurrent clicks, signout, two-account isolation |
| IMP-01–07 | P0 | pdfProcessors.integration, pdfStream, pdfStream.anydoc, anydocPdf, documentNormalization, documents tests: both engines, failure/recovery, ordering/repair | Browser worker/WASM, scanned and complex layout limits, current extraction status |
| IMP-08–10 | P0 | Storage/documents unit coverage; `qa:browser` same-name imports and original-byte isolation | Physical picker cancellation and interrupted persistence as specified in registry |
| LIB-01–04 | P0 | storage, syncClient tests; isolated rules CRUD; `qa:browser` synthetic search/reopen/delete/cancel/source preservation | Independent-device deletion, offline failure and cloud reconciliation |
| READ-01–03, READ-08–09 | P0 | bookStream, chapters, ReaderWords, documentNormalization, processor route tests | Visible navigation/highlight, real reprocessing/resume |
| READ-04–07 | P0 | viewportPackCache and bookStream tests | Resize/rotation, tall paragraphs, late resume and original/parallel canvas |
| TTS-01–10 | P0 | TTSEngine, TTSEngine.lifecycle, useTTS, ttsStream, BimodalSyncEngine, fishVoice, useMediaSession tests | Audible provider/system output, seek, rapid switches, fault injection, physical interruption/lock/media controls |
| SYNC-01–06 | P0 | syncClient/storage and isolated rules tests | Independent devices/accounts, conflict/offline recovery; local tests do not establish real sync |
| HAND-01–04 | P1 | handoff tests: URL parsing, legacy/stream indexes, pending persistence | QR/copy, missing book, sign-in continuation, differing viewports |
| UI-01–05 | P1 (visual polish P2) | Branding, ReaderWords, useMobileFocusChrome tests | Keyboard/focus/screen reader, narrow layout, physical touch/keyboard/rotation |
| PRIV-01–02 | P0 | analytics/attribution/feedback and storage tests | Network inspection before/after consent, key handling, signout and source locality |
| FEED-01–02 | P1 | feedback/FeedbackDialog and isolated feedback rules tests | Authorized disposable submission, denial/network recovery, duplicate prevention |
| PWA-01–02 | P1 | qa:live manifest/icons/service-worker checks; service-worker unit tests; `qa:offline` cold local shell | Physical install/update, offline books and recovery on supported platforms |
| LOCAL-01–03 | P1 | server index/sync-store/tts-cache tests | Optional local service availability and binding; do not restart active service |
| BACK-01–03 | P0 | qa:live domain checks and isolated rules suite | Coordinated backend changes only; preserve all unrelated domains/namespaces |

## Added recovery regressions

| Stable ID | Scenario / expected outcome | Mapping |
| --- | --- | --- |
| READ-10 | Corrupt cached boundaries (missing zero, duplicate, descending, fractional, negative, string/null, out of range) are rejected; fresh packing retains every source block once. Valid boundaries and empty stream behavior stay compatible. | `viewportPackCache.test.ts`; manual late-page reload with a synthetic book after corrupting only its QA-profile cache |
| READ-11 | Re-extracted content changes without changing block count/word count must invalidate old measured layout. | `viewportPackCache.test.ts`; manual same-length content edit/reprocess and resize |
| HAND-05 | Malformed optional stream anchors fall back to valid legacy page/block anchors; numeric prefixes, fractional/unsafe/nonfinite offsets never become accepted indexes. | `handoff.test.ts`; manual malformed QR/link and sign-in continuation |
| PREF-01 | Migrate legacy volume 0 without unmuting; missing/invalid legacy values default to 1; out-of-range values clamp to 0–1. Current saved volume and font scale remain within UI limits after corrupt storage recovery. | `storage.test.ts`; manual isolated-profile legacy mute migration and font controls |
| PRIV-03 | Saving local preferences omits both provider secrets; loading historical preferences never restores plaintext keys. Denied reads return safe defaults. | `storage.test.ts`; manual network/storage inspection still required for full PRIV-01/02 |
| READ-12 | Restore a valid late stream anchor into a shorter viewport pack without an out-of-range page or indefinite Preparing page. All168 synthetic markers remain reachable exactly once after reload/resize. | `npm run qa:browser`; physical device reflow remains separate |
| HAND-06 | Stored public-sample handoff prompts without switching the active book; explicit Continue loads the target viewport before applying the page/block anchor. | `npm run qa:browser`; actual account-link continuation remains manual |
| STORE-01 | A quota failure writing the local library keeps the app/session usable and shows an actionable local-save warning instead of the fatal error boundary. | `storage.test.ts`, `npm run qa:browser` synthetic browser quota |
| STORE-02 | After restoring writable storage, Try saving again persists the current state and clears the warning only when all failing save areas recover. | `storage.test.ts`, `npm run qa:browser`; real browser quota/private policy remains manual |
| READ-13 | An impossible legacy page with no stream position is deferred during provisional packing, then clamped/healed when the final pack is ready. No permanent Preparing page. | `bookStream.test.ts`, `npm run qa:browser` |
| TTS-11 | Provider failure repeated during reflow does not create a render loop or request storm; background retries for the same text/voice wait30s, explicit Play retries immediately and falls back on failure. | `TTSEngine.test.ts`, browser bounded-idle/provider503 cases; real provider/device audio remains separate |
| READ-14 | One tall paragraph with450 markers plus20 short paragraphs remains fully reachable before/after reload. No hidden-overflow clipping; split-fragment packs are not cached as source-stream boundaries. | `npm run qa:browser` checks marker uniqueness and prose/body geometry; physical font/rendering differences remain manual |
| HAND-07 | Delay measured layout while switching an existing PDF to a public sample with page-only/malformed-stream target. Pending target survives the target's provisional rendering, then lands on requested page3 only after final starts commit for that document. | `npm run qa:browser`,80ms injected scheduler yields; no real account/network use |
| IMP-11 | If a later file in a batch fails, earlier completed imports remain in the library and the error reports partial success. Retrying only the failed file adds it without replacing or duplicating the first success. | `npm run qa:browser` synthetic second-source503; real IndexedDB/provider cases remain separate |
| READ-15 | Short prose containing the document filename (or contained within its title) remains readable/speakable; ordinary prose matching the filename exactly also survives; only a heading with an exact normalized title match is suppressed as title furniture. | `documents.test.ts`, `qa:browser` original two-line first.pdf regression |
| PWA-03 | First offline shell reload after installation works with HTTP cache cleared and origin stopped, including entry scripts/styles and visible images; failed assets never receive HTML, unrelated caches survive activation. | `service-worker.test.mjs`, `npm run qa:offline`; also reopens one previously read synthetic PDF; full installed-PWA/account/book acceptance remains separate |
| HAND-08 | A tall-paragraph handoff narrow390px to wide1280px and back retains the exact highlighted token, despite different fragment/page boundaries. New optional gw uses reader tokens; legacy/malformed fallback remains compatible. | `handoff.test.ts`, `qa:browser`; same processed text required; automatic synced progress migration is separate |

Platform matrix: desktop Chromium and Safari, physical Android Chrome and iOS Safari, installed PWA; online/offline/interrupted/denied storage. Canonical guide contains exact fixtures and pass oracles for every case. Missing devices/credentials are BLOCKED, never PASS or N/A.
