# FolioDuet relaunch — 2026-09-28

## Requested sequence
1. Three Instagram pieces from Dinstinct brief DL-FOLIODUET-ART-20260928-01, 1080×1350.
2. Android application with premium visual quality and web feature parity.
3. Manually transcribe selected source-PDF pages from their images, retain references, iterate parser using comparisons, and expose a debug comparison page.

## Baseline and preservation
HEAD c431fe1. Existing modifications inventoried in baseline-2026-09-28.txt; binary tracked diff backed up at /tmp/folioduet-before-relaunch.patch. Existing September 22 ledger is docs/TOKEN_BURN_2026-09-22.md. Shared Firebase/Boxie changes predate this work. No release existed in GitHub release listing at start.

## Artwork
Brief: https://dionlabs.slack.com/archives/C0C1KUHFBDF/p1790575619161919
Three separate built-in imagegen results saved under output/relaunch-2026-09-28; dimensions verified 1080×1350. Official local narrator, Dinstinct and Pocket Bot references inspected. No posting or Slack message sent. D handles posting. Prompts and asset review retained in output directory.

## Android
Architecture preference requested asynchronously. Shared reader recommended to avoid parser/auth/TTS divergence. Implementation and validation pending. No parity claim yet.

## Parser
Shared normalization owner: src/v2/documentNormalization.ts. Shared stream/semantic owner: documents.ts and bookStream.ts. Engine-specific extraction remains in adapters. Pain points from earlier record: hyphen loss, furniture, heading fragmentation, reading order, paragraph boundaries, figures/captions and real-engine equivalence. Manual references must be authored by visually reading source page images, never copied from parser/OCR. Source-derived fixtures stay in ignored local-evals; generic fixtures/tests can be committed. Debug route must not ship copyrighted references.

## Acceptance
Keep fresh automated, browser/emulator, physical-device, Google-account, release and deployment evidence distinct. Native APK build does not establish full Android parity. Retain open unrun gates explicitly.

## Checkpoint — Android candidate and parser iteration
- Android release APK/AAB build and signature pass. Emulator found/fixed missing ManageDataLauncherActivity and splash FileProvider root (files, not cache). Host GPU crashed emulator Chrome; software-rendered isolated emulator runs the canonical guest reader and demo. Visible browser toolbar is expected until production Digital Asset Links is deployed. No real Google sign-in or physical audible certification.
- Existing web baseline: 249 passed / 1 optional skip; browser recovery 47/47. New geometry and comparison tests: 256 passed / 1 skip.
- Manually typed three references from source images (no OCR/parser-assisted reference writing), PDF pages 8, 9, 18. Hashes and method ledger under ignored local-evals/parser-lab. Earlier private evaluation observations recovered locally.
- Baseline isolated-page PDF.js word accuracy: 95.4 / 93.9 / 97.2%; paragraphs 6/4, 5/5, 6/6; false duplicated headings on first two.
- Geometry iteration: 98.3 / 97.9 / 99.4%; paragraph counts exactly 4,5,6 and headings exactly 1,0,1. Wrapped heading no longer duplicated; small running header/footer removed; indentation retained.
- Complete-document lexical evidence (same shared normalizer, physical-page map added): 99.6 / 99.1 / 100%; exact structural counts. Remaining four edits are three uncertain compounds/soft wraps and one source-text-layer discrepancy vs manual visual reading. No title-specific corrections added.
- AnyDoc remains structurally worse (merges paragraphs and introduces split/merged words); lab makes it selectable and records actual engine/fallback. No claim that AnyDoc is now satisfactory.
- Lab: /parser-lab.html, source/manual/actual panels, Markdown/reading/speech views, download review JSON, optional full-document context. Local fixtures served by localhost-only development middleware, excluded from production bundle.

## Final local checks
257 unit/integration tests passed, 1 optional fixture skipped; web build passes. Private source prose/PDF absence checked in dist; parser-lab.html and certificate association are present. Artwork exports corrected to proportional center-crop (no stretch) and verified 1080×1350. Final APK/AAB recopied after launch fixes; SHA256SUMS regenerated. Local workbench server remains on 127.0.0.1:5198 for review. Production deployment and public release are pending; no claim of full Android parity certification.

## Isolated source verification
Commit 86153f5 contains only this request's changes; preexisting dirty reader/QA/Firebase paths remain untouched and uncommitted. Exporting that commit to /tmp/folioduet-relaunch-candidate passed 192 tests with 1 optional fixture skipped and built successfully. The higher 257-test count and 47-browser-case run belong to the integrated working checkout, including earlier September 22 work; they are not attributed to the isolated commit.

Final APK and AAB signatures verified after copying the fixed artifacts; hashes are in output/android-0.1.0/SHA256SUMS. Disposable emulator and its CDP forwarding were stopped. The local workbench server remains running for D's review. Live read-only checks passed against existing production, not a new deployment.
