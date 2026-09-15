# FolioDuet whole-app regression QA

This is the execution guide for an agent certifying a specific build and deployed environment. It covers the complete application, not only PDF extraction. Start here before committing or deploying changes; finish the live gates after deployment. Use [the report template](report-template.md) to record results.

## 1. What a certification means

A certificate means **no regression observed in the named scenarios, environments, fixtures, and build**, not proof that no defect exists. Unit tests, a successful build, a deployment marked successful, and an HTTP 200 response are each insufficient on their own.

Record every case as `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`, or `N/A`. Attach concrete evidence to PASS. A screenshot of a button is not evidence that the action behind it succeeded. For N/A, explain the missing capability or deployment mode; unavailable credentials/devices are BLOCKED, not N/A.

- **Full certification:** all applicable cases below pass in the declared matrix; no untriaged failures, blocked cases, or unexecuted cases. State baseline defects explicitly. Do not turn them into a clean pass merely because they predate the patch.
- **Scoped release verification:** automated suite + changed-feature coverage + all mandatory live gates pass. List remaining cases as NOT RUN/BLOCKED and say that whole-app certification is incomplete.
- Any failed authentication, wrong-account data exposure, lost/duplicated content, unusable playback, missing production asset, or deployment mismatch fails the release gate. Investigate and fix or use the documented known-good deployment; do not conceal the failure with a narrower claim.
- Rerun affected cases after a fix. Rerun live gates after any deployment or shared Firebase/Auth configuration change, including changes initiated by another DionLabs application.

The incident motivating this guide: Firebase's shared `authorizedDomains` list contained only `boxie.dionlabs.ai`. FolioDuet still built, loaded, and restored guests, but Google sign-in failed with `auth/unauthorized-domain`. Always test the final account transition and the live configuration.

## 2. Preparation, fixtures, and evidence

### Record the environment

Record UTC time, tested commit (`git rev-parse HEAD`), dirty status, Node/npm and browser versions, OS, screen size, hosting project/deployment ID/URL, deployed commit, Firebase project ID, enabled mode (Firebase or optional local server), selected extractor, and selected TTS provider. Never copy secrets, tokens, account email addresses, private document text, or OAuth callback queries into committed reports.

Use the actual production custom domain for production gates. A localhost test or a Pages preview does not establish that production is authorized. The official Pages project is `pageecho`, production branch `main`, canonical host `folioduet.dionlabs.ai`, legacy host `pageecho.dionlabs.ai`, Firebase project `dionlabs-fe92e` (project number `263927058814`). Verify current provider configuration; these names do not grant authority to mutate unrelated resources.

Read `AGENTS.md`, [processing strategy ownership](../processing-strategies.md), and [PDF evaluation rules](../pdf-extraction-evaluation.md). Inspect current Git changes and deployment configuration. Preserve unrelated work; commit only intended files. Do not include source PDFs or generated private extracts. Do not deploy the complete shared Firestore rules as part of a frontend-only change.

### Browser/device matrix

- Desktop Chromium: fresh storage, existing guest, existing Google user; normal and narrow layouts.
- Desktop Safari/WebKit: popup restrictions, storage restoration, reader and audio.
- Physical Android Chrome and physical iOS Safari: touch controls, file picker, keyboard, rotation, audio interruption, screen lock, handoff. Record exact versions.
- Installed/PWA mode where supported: start, update, offline behavior, media controls.
- Two independent browser profiles/devices for sync; a second QA account for isolation. Two tabs sharing the same storage are not an independent sync test.
- Online, offline, slow/interrupted network, and denied storage/provider requests. Simulate failures locally or in an isolated staging environment. Never break production configuration to manufacture a failure.

Use a dedicated QA profile/account and invented disposable documents. Do not clear the user's normal browser storage or delete their books. Creating/sending production feedback, changing credentials, granting permissions, or destructive cleanup still requires the authorization appropriate to that action; a checklist is not blanket authorization. If a credential or device is unavailable, record BLOCKED and continue independent cases. Do not invent credentials or broaden access to finish a test.

### Fixture catalogue

Create generic fixtures locally under ignored `local-evals/qa/<run>/`. Include a short manifest of intended content and expected structure. Do not reuse private book excerpts. The real-engine automated test `src/v2/pdfProcessors.integration.test.ts` uses the invented, deterministic PDF builder in `tools/qa/pdf-fixtures.ts`.

| Fixture | Contents / purpose |
| --- | --- |
| F01 short text PDF | 3–5 pages; unique invented paragraphs and chapter markers; one blank page; final sentinel sentence. Verify source order, retained text, skipped blank ink. |
| F02 structure PDF | Numbered chapters, a wrapped title, a repeated numbered running header, Roman page numbers, short subheadings, Unicode and punctuation. Record expected retained/removed blocks. |
| F03 wrap PDF | `Architecture` and `archi- tecture`; `long-term` and `long- term`; conflicting `recreation`/`re-creation`; a physical EOL split and a text-item split; evidence on another page. |
| F04 structured Markdown ZIP | `page_2.md`, `page_10.md`, headings, paragraphs, nested ordered/unordered lists, links, emphasis, entities, tables, inline/fenced/indented code, `pe:` skip/furniture markers. ZIP compatibility is exercised through stored fixtures/API if the current import UI only exposes PDFs. |
| F05 invalid/empty inputs | Zero-byte and malformed PDF, image-only/scanned PDF, corrupt ZIP, ZIP without Markdown. Each is a separate input, not a single combined case. |
| F06 long document | At least 200 synthetic pages, long paragraphs exceeding a viewport, unique start/middle/end markers. Measure processing and reflow times against the same baseline device. |
| F07 audio segments | Short invented text, punctuation, Unicode, long segment and adjacent pages; provider mocks for silent audio, missing timestamps, 401, 429, 500, timeout, and cancellation. |
| F08 account/handoff | Distinct disposable books for guest, QA account A, and QA account B; a link to a known middle-of-book block plus malformed/out-of-range links. |

### Evidence rules

For each case record fixture, environment, action, observed outcome, expected outcome, timestamp, and a screenshot/log/assertion reference. Record console/network errors since the action (not stale errors from an earlier test). Keep raw sensitive logs local; committed summaries contain only sanitized outcomes. For audio record actual audible playback separately from timing/highlight observations. A muted test cannot certify sound quality. Record counts, skipped tests, build warnings, and exit codes rather than “tests looked fine.”

## 3. Automated baseline

Run from the repository root on the exact candidate tree:

```sh
npm ci
npm test
npm run build
git diff --check
npm run qa:live
```

`qa:live` is read-only and checks the current official deployment, **not the local candidate** until that candidate is deployed. It derives the Firebase web configuration from the served JavaScript, checks the project and required domain entries, HTTP assets, OAuth opener header, manifest/icons, service worker and legacy redirect. It prints no API keys. It does not sign in or exercise speech, Firestore permissions, mobile behavior, or complete-browser workflows. If the bundle/config format changes, update the probe after inspecting the new format; do not bypass its failing checks.

If shared Firestore rules change, also run:

```sh
npm run test:rules
```

This needs a working Java runtime and Firebase emulator. The default `npm test` excludes that separate emulator suite. A missing Java runtime is BLOCKED. Add/run owner-versus-other-user emulator assertions for affected FolioDuet/catalog/feedback collections too; Boxie's tests alone do not certify FolioDuet permissions. Preserve all other shared namespaces. Use a clean intended rules file, not unrelated working-tree edits.

The evaluation CLI needs Node 22.18+ for its direct TypeScript import. On older supported application runtimes, record that tooling prerequisite separately.

### Automated coverage map (not a substitute for the scenario catalogue)

| Area | Existing test entry points |
| --- | --- |
| Authentication and onboarding | `firebase/auth.test.ts`, `authUrl.test.ts`, `config.test.ts`; `components/GoogleSignInButton.test.tsx`, `FirstRunWelcome.test.tsx`; `tools/qa/check-live.test.mjs` |
| Extraction and shared repair | `pdfStream.test.ts`, `pdfStream.anydoc.test.ts`, `anydocPdf.test.ts`, `documentNormalization.test.ts`, `pdfProcessors.integration.test.ts` |
| Structure and reading | `documents.test.ts`, `chapters.test.ts`, `bookStream.test.ts`, `viewportPackCache.test.ts`, `components/ReaderWords.test.tsx` |
| Speech | `src/hooks/useTTS.test.ts`, `TTSEngine.test.ts`, `src/utils/BimodalSyncEngine.test.ts`, `ttsStream.test.ts`, `fishVoice.test.ts` |
| Persistence and mobility | `storage.test.ts`, `syncClient.test.ts`, `handoff.test.ts`, `useMediaSession.test.ts`, `useMobileFocusChrome.test.ts` |
| Feedback, privacy, catalogue | `firebase/feedback.test.ts`, `analytics.test.ts`, `attribution.test.ts`, `catalog/constants.test.ts`, `components/FeedbackDialog.test.tsx`, `legal.test.ts`, `components/Branding.test.tsx` |
| Hosting and optional server | `functions/_middleware.test.ts`; `server/index.test.mjs`, `sync-store.test.mjs`, `tts-cache.test.mjs`; separate `firebase-tests/` emulator suite |

Paths without a leading directory in this table are under `src/v2/`. Re-discover the test inventory after changes. Optional private-file tests may skip; explicitly report them and use the committed synthetic real-engine test for reproducible engine coverage.

## 4. Scenario catalogue

For every row, perform the stated action and compare the result with the oracle. “No error” alone is not a sufficient oracle. `GATE` identifies mandatory live checks for every deployment; other cases run for full certification and when their subsystem changes.

### A. Hosting, startup, authentication (all applicable desktop/mobile browsers)

| ID | Procedure | Pass oracle / evidence |
| --- | --- | --- |
| HOST-01 GATE | Compare Git HEAD, hosting production deployment commit, canonical-domain HTML and its JS asset references after deployment. Open the canonical URL in a fresh tab. | Hosting reports the exact intended commit; domain serves that deployment's assets; app renders. Save commit/deployment ID and asset URLs without secrets. |
| HOST-02 GATE | Run `npm run qa:live`; fetch both public guide pages, manifest, icons and service worker. | Probe passes; JS/WASM/CSS/image responses have correct bodies/types, not SPA HTML disguised as assets. Separately open lazy extractor assets through an actual PDF import. |
| HOST-03 GATE | Open an old-host URL with a benign query and a guide-page path. | 308 goes to the same path/query on `folioduet.dionlabs.ai`; no loop or loss of handoff parameters. |
| HOST-04 | Refresh root, `/v2`, a valid guide URL, a malformed handoff and an unknown path. | Supported URLs recover predictably; unknown/malformed URLs do not trap the app or silently render a broken page. Record actual fallback/404 policy; do not assume every unknown SPA route must be 404. |
| START-01 GATE | In fresh QA storage, load home, wait for auth readiness, open demo and import UI. | Guest becomes usable, onboarding controls work, no indefinite “Connecting”; a Google account is not required for the first useful path. |
| START-02 | Reload while an existing guest/Google session is restoring on a slow network. | Existing account is restored; no guest is minted over Google; library is neither erased nor briefly exposed from a different account. Guests intentionally land on Home with their library retained; signed-in accounts restore an active book. |
| AUTH-01 GATE | Run the live probe and read the authoritative shared Firebase Auth config using an authorized admin channel if config changed. Compare the complete before/after domain list. | Canonical host is present; all previously authorized unrelated hosts are preserved; Google/anonymous provider settings remain enabled. The public probe proves the domain list, not provider enablement. Never PATCH a replacement list containing only this app. |
| AUTH-02 GATE | From Guest on the **production canonical host**, click Continue with Google and complete the normal QA-account flow. | UI transitions to the signed-in account and synced library; reload retains it. Capture the final state. A popup merely opening, disappearing, or showing the guest SPA fails. `auth/unauthorized-domain` fails immediately. |
| AUTH-03 | Create a disposable guest book, then Google-link to an account not already linked to that guest. | Guest work remains available once, with reading position intact; no duplicate book or loss after reload. Record UID relation privately, not in a public report. |
| AUTH-04 | From a guest containing F08, sign in to an existing QA Google account that already has another book. | Credential-already-in-use fallback reaches that account, both intended libraries merge without overwriting existing progress or cross-account content. |
| AUTH-05 | Close the popup; repeat with popup blocking and offline/denied auth requests in staging. Retry after restoring conditions. | Cancel returns to usable Guest; blocking/network failure gives actionable UI; retry works; busy state clears; no redirect to a non-proxied SPA auth handler. |
| AUTH-06 | Double-click sign-in; switch focus while pending; test narrow/touch and Safari popup policies. | One pending flow, no duplicated account transitions; the actual browser behavior matches the configured popup/helper setup. |
| AUTH-07 GATE | In a disposable QA profile, sign out and reload, then sign back into the same account. | Fresh guest state contains no private account library/secrets; signing back in restores that account's cloud library. Do not sign out the user's active working profile just to run this case. |
| AUTH-08 | Sign in to QA account B in another profile; attempt to read/write A's test records using the emulator or an authorized isolated integration test. | Cross-user operations are denied; B never sees A's books or provider secrets. UI separation alone is insufficient permission evidence. |

### B. Import, extraction, and library

| ID | Procedure | Pass oracle / evidence |
| --- | --- | --- |
| IMP-01 GATE | Import F01 with FolioDuet selected; wait for decoded text, nonzero layout, and completed extraction status. | Correct engine reported, ordered text and final sentinel present, blank page excluded from speakable output; original remains available locally. |
| IMP-02 GATE | Repeat F01/F03 with AnyDoc beta. Open Settings after conversion. | AnyDoc finishes via worker and reports AnyDoc; same applicable repair/content invariants hold. A fallback is reported as fallback, not counted as successful AnyDoc conversion. |
| IMP-03 | Run route-matrix tests; in staging inject AnyDoc exception and whitespace-only result. | PDF.js fallback succeeds, reports requested/used engines correctly, and applies common normalization. Failure of both engines yields an understandable error and a usable shell. |
| IMP-04 | Process F03 through both real engines, then open archived/synced equivalents. | Evidence-backed `architecture` joins; `long-term` retains its hyphen; conflicting/uncertain compounds retain theirs; source boundaries remain; repeated normalization makes no further changes. |
| IMP-05 | Process F02 and compare fixture inventory to extracted/read text. | Heading order, body sentinel counts, Roman/page-furniture rules and Unicode match the declared oracle. Log engine-specific reading-order defects; do not require identical raw Markdown. |
| IMP-06 | Load F04 through the Markdown compatibility path; check page sorting and structure. | Page 2 precedes page 10; lists/tables/links/code preserve intended semantics; unsupported ZIPs fail clearly. Do not claim a ZIP picker exists where the UI exposes PDFs only. |
| IMP-07 | Attempt every F05 input separately, then a valid F01 without reloading. | Invalid/scanned/empty inputs do not leave infinite progress, crash the app or corrupt the library. A valid subsequent import works. No OCR success claim for a text-only processor. |
| IMP-08 | Import multiple PDFs; re-import the same fixture; test same filename with different content. | Library policy is consistent and understandable; content is not silently overwritten/misattributed. Record IDs/counts privately and compare expected retained titles. |
| IMP-09 | Cancel file picker; close import dialog; drag a supported file; try an unsupported type through an isolated test. | Cancel does nothing; valid drag import works; busy state prevents inconsistent operations; unsupported input gets a useful error. |
| IMP-10 | During F06 conversion, interact with permitted controls; switch documents/extractors or navigate away. | UI remains responsive; stale extraction never replaces the currently selected book; abandoned worker/resources are accounted for; last page is retained. Measure timing and compare baseline. |
| LIB-01 | Search for exact, partial, case-varied and absent fixture titles; clear search. | Correct matching subset and clear empty state; clearing restores the collection; selection opens the right book. |
| LIB-02 | Reload/reopen after imports and progress changes. | Titles, progress and processed-content status persist. Signed-in accounts restore the active document; guests intentionally land on Home and can reopen their retained book with saved progress. No duplicate demo. |
| LIB-03 | Delete only an explicitly disposable QA book, then reload and check another QA device. | Removal follows the implemented sync policy; unrelated documents, their source bytes and reading positions remain unchanged. Obtain required destructive-action authorization first. |
| LIB-04 | Remove/unavailable original in an isolated fixture environment while keeping processed pages. | Reading still works from synced text; original/parallel features explain missing original; no false “available offline”/original claim. |

### C. Reading, structure, pagination, original PDF

| ID | Procedure | Pass oracle / evidence |
| --- | --- | --- |
| READ-01 GATE | Read the start, middle and final sentinel of F01 in reading view; next/previous page and direct page-number entry. | Correct ordered text; no missing/duplicated blocks; controls clamp/reject invalid page input; end-of-book navigation remains usable. |
| READ-02 | Inspect F02/F04 headings, wrapped chapter titles, adjacent duplicate title, deep subheadings and `pe:` annotations. | Chapter boundaries match oracle; duplicate chapter is suppressed; subheading does not force false chapter; marked furniture/skip blocks are excluded as designed. |
| READ-03 | Open chapter list; choose first/middle/last; move pages across a chapter boundary. | Entries target the intended stream block and highlight the current chapter. Compare navigation eligibility separately from visual heading breaks; report unexpected omission. |
| READ-04 | Increase/decrease font size through available values, resize desktop, rotate phone while paused mid-book. | No clipped text, blank tail or disappearing paragraphs; current reading anchor stays near the same text; total page count settles. |
| READ-05 | Use F06 paragraphs taller than a viewport and chapters near a page boundary. | All words remain reachable exactly once across packed pages; no overflow hidden offscreen; heading/body relationship remains legible. |
| READ-06 | Reload at a late page; reopen cached pack; change font/viewport; use a fixture with old/missing stream index. | Signed-in auto-resume, or manual reopening from Guest Home, does not jump to page 1 or become permanently clamped; saved page/stream fallback follows valid anchors; stale packs are rejected when appropriate. |
| READ-07 | Switch Reading, Original and Parallel where the original exists; zoom/scroll/select a word; switch back. | Original renders without blank canvas; supported synchronization remains coherent; reader text/progress survives mode switches. Any physical-page versus reflow-page distinction is clear. |
| READ-08 | Test bold/italic/link/entity/list/table content and click words at block boundaries. | Rendered words, speech text and highlight token indexes agree; literal Markdown syntax is not spoken as content unintentionally; links remain safe and usable. |
| READ-09 | Reprocess the same F03 after changing extractor; compare content and resume. | Correct selected-engine status, no duplicated streams; position remains usable or a deliberate reset is explained. Do not silently reuse a stale extraction. |

### D. Speech, buffering, interruptions and media controls

| ID | Procedure | Pass oracle / evidence |
| --- | --- | --- |
| TTS-01 GATE | Play the public demo or F07 with the production default provider. Listen and observe successive word highlights. | Actual non-silent speech starts; highlights advance with spoken words; Pause stops progression and Resume continues without replaying an unrelated passage. Muted timing-only evidence is insufficient. |
| TTS-02 | Disable neural providers in a QA profile and use available system speech. | Native speech starts after a user gesture, follows the selected text and supports pause/stop. Record browser/OS voice limitations. |
| TTS-03 | With authorized QA credentials, exercise Fish and Inworld independently; select a different voice and replay. | Intended provider/voice is used, settings persist appropriately, no stale previous-voice audio. No key appears in logs, ordinary preferences, exported URLs or committed evidence. |
| TTS-04 | While playing, change speed and volume, pause/resume, stop, seek to another word and another page. | Audible speed/volume respond; stopped/old audio cannot restart; highlight and audio converge on the requested word. |
| TTS-05 | Play across segment/page and chapter boundaries, including the final page. | No repeated/skipped phrase at boundaries, no unwanted double playback, predictable final stop. Record any audible gap against baseline. |
| TTS-06 | Set buffering to 1/3/5 ahead; observe sanitized requests and cancel/change document/voice. | Buffer respects the selected bound; invalidated prefetch does not play later or grow without bound; changing settings preserves usable playback. |
| TTS-07 | Run/inject F07 silent/malformed audio, missing timestamps, 401/429/500 and timeout failures in staging. | Error/fallback is explicit and usable, silent clips are rejected, retries are bounded, busy states clear. A system fallback is not counted as provider success. |
| TTS-08 | Interrupt connectivity during playback/prefetch, recover, then retry the same and a new segment. | Already buffered audio behaves predictably; no permanently wedged player or leaked stale request; recovery works. |
| TTS-09 | On physical phones, lock/unlock, background/foreground, receive an audio interruption; use media-session play/pause/next where supported. | Player/media controls remain consistent, interruption does not create simultaneous audio; document resume is preserved. Unsupported OS controls are reported precisely. |
| TTS-10 | Perform a local muted timing run with `?testVolume=0`, then test production normally. | Local audio timing remains active while silent; saved volume is unchanged; production ignores the test override. This case certifies the test mechanism, not sound quality. |

### E. Storage, cloud sync, offline, handoff

| ID | Procedure | Pass oracle / evidence |
| --- | --- | --- |
| SYNC-01 GATE | With QA account A, import a disposable F01 on device/profile A, open same account on independent B without copying original bytes. | Processed reading text and progress arrive; original PDF is not uploaded or implied to exist on B; signed-in status and sync indicator are accurate. |
| SYNC-02 | Change progress/preferences on A, wait for completion, reload/open B, then reverse direction. | Supported fields converge without a stale write resetting newer progress; provider secret fields remain in their intended protected storage. |
| SYNC-03 | Edit progress offline on A; reconnect; reload. Test simultaneous progress updates on two QA clients. | No library loss; implemented conflict policy is consistent; offline/syncing/error indicators reflect reality. Record conflict behavior rather than inventing stronger guarantees. |
| SYNC-04 | Simulate permission denied, request failure and storage quota failure in isolated tests. | User sees actionable state; local reading stays usable when possible; no claim of successful sync when persistence failed. |
| SYNC-05 | Cold reload with IndexedDB/storage restrictions, then a normal QA profile. | Failure is contained and explained; normal profile recovers; no credentials or another user's library are exposed. |
| SYNC-06 | Open F01 and shell online, go offline, reload and try a never-opened book. | Cached/opened resources and original availability match actual behavior; uncached content fails honestly. Do not certify complete offline support from a cached homepage alone. |
| HAND-01 | Generate a handoff at a known middle word; scan/open on a differently sized physical device signed into the same QA account. | Correct book and logical text anchor open despite different pagination; page/block/word correspond to intended content. |
| HAND-02 | Open the handoff while signed out, sign in, then reload. | Pending target survives the login flow and is applied once; callback/query cleanup does not erase unrelated query/hash state. |
| HAND-03 | Exercise legacy links without stream index, malformed/negative/huge indexes, unavailable book and wrong account. | Safe bounds and clear unavailable state; no crash, forced unrelated navigation or unauthorized access. |
| HAND-04 | Copy handoff link, close/reopen dialog, and inspect QR and link in a QA profile. | Both encode the same intended target; no API key, credential or original document bytes embedded. |

### F. Settings, privacy, feedback, accessibility, installation

| ID | Procedure | Pass oracle / evidence |
| --- | --- | --- |
| UI-01 | Open/close Settings, library, chapters, import, legal, feedback and handoff via their supported buttons; use Escape/backdrop where supported. | Dialogs do not trap the user; controls return to a sensible focus target; no unintended behind-dialog action. Record unsupported keyboard behavior as a defect, not an assumed pass. |
| UI-02 | Switch light/dark, font, extractor, buffering, rate and voice settings; reload a QA profile. | Correct controls and persisted values; text and controls remain readable in both themes; changing one preference does not reset others. |
| UI-03 | Keyboard-only traversal and screen-reader inspection of core import/sign-in/playback/reader flows. | Focus visible and order usable; buttons have names, dialogs labelled, errors announced; no essential mouse-only action. |
| UI-04 | At narrow phone width, landscape, browser text zoom and safe-area insets, open keyboard and dialogs while reading. | No inaccessible actions/overlap; scroll and touch controls work; focus mode reveals controls when needed. Capture screenshots after actual nonzero layout. |
| UI-05 | Open Terms, Privacy, Lab privacy, GitHub, Sponsor and both SEO guide pages. | Correct destinations and branding; legal text renders and dialogs close; no broken link or incorrect same-window state loss. |
| PRIV-01 | In fresh QA storage inspect requests/cookies before consent; decline, reload, then allow and later change consent if supported. | Analytics initialization/events match actual consent; no analytics before consent. Avoid treating necessary Firebase requests as analytics. |
| PRIV-02 | Inspect import, sync, feedback and provider requests with invented fixtures and authorized test credentials. | Original PDFs stay local in Firebase mode; processed text goes only to intended storage; no secret in URL/log/analytics or public document. |
| FEED-01 | Open feedback as Guest; test empty, too-long and valid invented input; close/cancel. | Validation works, draft/error behavior is clear, cancellation sends nothing; opening feedback does not require Google. |
| FEED-02 | With explicit send authorization, submit one labelled QA message to the intended test destination; inject failure in staging. | Success shown only after write; no duplicate submission; failure retains recoverable input. Verify create-only/owner constraints via emulator, not by browsing real feedback. |
| PWA-01 | Install/open where supported, reload after a new deployment, and compare cached versus fresh QA profile. | Correct manifest/icon/start URL; new build becomes usable; stale shell does not reference missing bundles or break sign-in. |
| PWA-02 | Test service-worker update and offline transition during a reading session. | No lost document/progress, no HTML substituted for a requested script without visible recovery; API requests are not mistaken for cached shell. |

### G. Optional local server and shared backend changes

| ID | Procedure | Pass oracle / evidence |
| --- | --- | --- |
| LOCAL-01 | Start documented local server mode in an isolated directory; load app without Firebase configuration; import/read/reload a synthetic book. | Local source/sync behavior works as documented; no claim that it provides cloud account isolation. Mark N/A only when certifying a deployment that excludes this mode. |
| LOCAL-02 | Run `server/` tests and exercise TTS cache miss/hit, invalid request and restart persistence with F07. | Stable responses/cache behavior; malformed input rejected; no secret leakage. Compare server versus Pages Function behavior where both implement the same contract. |
| LOCAL-03 | Inspect local binding/proxy and test a stopped/unreachable local service. | No unrequested public exposure of the single-trust server; unavailable service yields a usable fallback/error. |
| BACK-01 | For any auth/project config change, snapshot relevant settings privately, apply an additive/minimal update, reread, run AUTH-01/02 and the other affected apps' smoke checks. | No unrelated domains/providers removed. Specifically preserve Boxie when fixing FolioDuet, and preserve FolioDuet when configuring Boxie. |
| BACK-02 | For changed shared rules, run relevant owner/other-user/anonymous/unauthenticated emulator cases plus Boxie suite before deployment, then controlled authorized integration checks. | Required owner operations succeed; cross-user/unauthenticated access and forbidden feedback mutation fail; unrelated collection contracts remain intact. |
| BACK-03 | Inspect production env variable names and build/runtime separation using the provider's configuration channel. | Firebase env belongs to the intended project; auth helper matches hosting; Function credentials stay server-side except explicitly public sponsor configuration. Never dump all values to logs. |

## 5. Release/deployment procedure and mandatory gate checklist

1. Update from the reviewed upstream commit without losing local changes. Record unrelated dirty files. Run the automated baseline and affected cases; inspect the staged diff for secrets, private fixtures and unrelated backend changes.
2. Fill the report with what actually ran. Identify the known-good production deployment/commit and how to promote or redeploy it. A rollback must keep the restored Firebase domain entry; reverting frontend code cannot repair an allowlist error.
3. Commit intended source, synthetic tests and QA documentation. Confirm `git show --stat HEAD` and `git diff --cached --check`. Push the authorized production branch. Prefer the existing hosting build/environment rather than a local build missing production env variables.
4. Wait for provider deployment success tied to that exact commit, then verify the canonical custom domain. If Git integration fails, inspect the build log and correct the concrete failure; do not claim the push itself deployed anything.
5. Execute HOST-01/02/03, START-01, AUTH-01/02/07, IMP-01/02, READ-01, TTS-01, SYNC-01 and all changed-feature cases. Use a dedicated QA session. A blocked account/device makes that gate BLOCKED; report it instead of silently substituting unit tests.
6. Observe console and network failures on those paths, including lazy PDF worker/WASM downloads. Compare a fresh browser and an existing cached QA session. Confirm consent/default provider state before interpreting audio results.
7. For tracked packaged releases, also satisfy `AGENTS.md`'s release artifact/version/download policy. A static site with no tracked package releases is verified through its production deployment; do not invent a package release history.
8. Publish a concise result with commit/deployment URL, passed gates, failed/blocked/unrun cases and the certification scope. Keep sanitized evidence in the report; private artifacts remain under `local-evals/`.

## 6. Keeping this suite useful

When a regression is found, add its minimal synthetic regression where possible and a scenario at the layer that exposed it. An external config regression needs an external config/live-action check; a pure component test cannot catch it. Update fixture oracles when intended product behavior changes and explain the change. Keep exact execution evidence out of the reusable descriptions so an old PASS cannot be mistaken for a current run.

## Follow-up regression coverage (2026-09-15)

- Rules execution requires Java 21 or newer. The supplied `github-actions.example.yml` installs Java 21 explicitly; activation is blocked by the current GitHub credential lacking workflow scope. `npm run test:rules` covers feedback, Boxie compatibility, FolioDuet owner CRUD, independent same-owner contexts, anonymous access, cross-user denial, and scoped deletion. These emulator checks do not certify live account linking or end-to-end encrypted sync.
- Audio lifecycle tests reject outstanding play promises after stop or replacement, and deliver both media-error and rejected-promise callbacks. Expect no stale fallback or interruption of the replacement player and exactly one fallback for a current failure. Browser audibility and device interruptions remain separate gates.
- Both real PDF engines process 200 ordered synthetic pages with blank boundaries. PDF.js rejects zero-byte/malformed files and recovers on the next valid import. Empty AnyDoc input reports OCR required. Scanned-image OCR and performance comparisons remain separate cases.
- `qa:live` requires static readable privacy/terms pages and HTTP 404 for unknown routes and missing assets, in addition to the shared OAuth-domain guard. Verify `/v2` still redirects to the reader and root handoff queries still load it.
