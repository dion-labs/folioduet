# Parser workbench

Start npm run dev:client -- --host 127.0.0.1 --port 5198, then open http://127.0.0.1:5198/parser-lab.html.

The source image, manually written reference, and actual parser reading stream appear side by side. Switch between reading, raw Markdown and speech text. The expandable raw extraction helps distinguish extraction errors from shared reading-stream cleanup. Save review exports the chosen engine, actual engine, fallback status, elapsed time, reference, parser output, metrics and review notes.

The lab does not pass the reference into the extraction engine. Manual references are authored visually from source images, separately from extraction. Reference hashes and authoring method are retained in the local corpus manifest.

## Local corpus

Source PDFs/images/transcriptions/results stay in ignored local-evals/parser-lab/. Localhost-only Vite middleware exposes only manifest.json, source.pdf, and page-NNN/{source.pdf,source.png,reference.md}. It has no production handler. Production users can select their own local files; no private fixture is built into dist.

Choose a source page and click Run comparison. PDF.js can optionally read the full document, use the same document-wide lexical evidence as ordinary import, and select the requested physical page through the new extraction page map. The isolated-page and full-context results are explicitly labelled; do not compare their scores as if they were the same input. AnyDoc lacks a physical page map and uses the selected spot PDF.

## Iteration evidence

| Case | Baseline PDF.js, isolated | Geometry PDF.js, isolated | Geometry + full-document evidence | Paragraphs / headings after |
| --- | ---: | ---: | ---: | --- |
| A | 95.4% | 98.3% | 99.6% | 4 / 1, matches reference |
| B | 93.9% | 97.9% | 99.1% | 5 / 0, matches reference |
| C | 97.2% | 99.4% | 100.0% | 6 / 1, matches reference |

These percentages measure ordered word edit distance, ignoring case and most punctuation. They do not certify semantic equivalence or whole-book quality. Visual inspection confirms the repaired paragraph boundaries and headings in these three cases. Full-context residuals: three conservative hyphen decisions, one text-layer discrepancy. No book-specific replacement rule was added.

AnyDoc remains experimental: tested spot-page paragraphs are merged and some tokens are split or joined incorrectly. Its scores and screenshots are retained alongside PDF.js; this work does not certify it.

## Implementation

PDF.js geometry is interpreted in src/v2/pdfLayout.ts. It uses baselines, font sizes, indentation and vertical separation to retain paragraphs, join wrapped headings and exclude isolated small running furniture. Small footnote prose below the body is retained; rotated/missing-coordinate and detected large-gutter layouts fall back to established extraction. This is a single-column prose improvement, not a general layout or OCR engine. Generic wrap decisions remain in shared documentNormalization; geometry is not applied to already structured Markdown.

Run tools/parser-lab/check-local.mjs with FOLIODUET_PLAYWRIGHT_MODULE and FOLIODUET_CHROME_BIN pointing to local Playwright/Chrome. FOLIODUET_LAB_OUTPUT chooses an ignored results directory; FOLIODUET_FULL_CONTEXT=1 exercises the complete-document mode. The runner blocks non-local network, exports exact review JSON, screenshots desktop/mobile, checks overflow and page errors.

Future corpus expansion should include multi-column text, lists, tables, footnotes, figures and cross-page paragraphs. Keep independent manual references; do not bless parser output as ground truth.

### Asset recovery (2026-09-28)

AnyDoc loads its worker and WASM with one bounded retry for startup/download
failures. The retry refreshes the HTTP cache for both resources. Conversion
errors are not retried. A 20-second startup timeout also enters this recovery
path; it stops once the worker reports that initialization completed.

After repeated loading failure, the reader and workbench show an actionable
notice. Refresh is never automatic and requires confirmation that imports have
finished and reviews are saved. Saved library data is retained; unsaved file
selections and workbench edits must be saved/reselected. The workbench shows the
fallback reason. Dynamic-import load errors also show this notice; retrying
arbitrary application imports is outside the AnyDoc retry mechanism.

Production-build browser checks used synthetic PDFs and intercepted asset
requests: normal startup, transient WASM 404, persistent WASM 404, and persistent
worker 404. They verified a maximum of two requests, successful transient
recovery, explained PDF.js fallback, and cancellation/dismissal without reload.
No Firebase rules or account configuration changed.

Difference highlighting compares exact words and punctuation in reading,
Markdown, and speech views. Coral marks missing/changed reference text; green
marks added/changed parser text. Whitespace is ignored. A toggle preserves the
underlying text; work is bounded to 6,000 tokens per side.

### Expanded PDF.js checks (2026-09-28)

Added 28 manually inspected/transcribed spot pages, for 31 total: 28 contain
reading text and 3 are image-only controls. References and source page images
remain in ignored `local-evals/parser-lab`; the production site does not receive
the private book or reference prose. The local workbench lists every new case.

Paired complete-document-context results against frozen references:

| Scope | Reference words | Before agreement | After agreement | Word edits before → after |
|---|---:|---:|---:|---:|
| All 28 text pages | 7,541 | 97.547% | 99.602% | 185 → 30 |
| 25 newly added text pages | 6,659 | 97.282% | 99.610% | 181 → 26 |
| Final 4 held-out pages | 1,182 | 98.393% | 99.746% | 19 → 3 |

Three image-only controls yielded zero reading words and are excluded from the
word percentages. Matching paragraph counts plus exact heading text improved
from 7/28 to 20/28 pages. This is a separate, incomplete structural measure; word
agreement is not layout, semantic, image-retention or narration certification.
Earlier holdouts were explicitly reclassified after inspection. The final four
were evaluated after the final parser change and were not used for further tuning.

Changes preserve explicit PDF whitespace, attach raised note numbers in reading
order, keep captions above body text, recognize top headings and hanging numbered
items, preserve list continuations, and distinguish numbered running furniture.
Uppercase wrap repair uses the same conservative document-word evidence as other
wraps; uncertain hyphens remain. No book-specific words or page identifiers enter
parser logic. Existing processed books are not automatically rewritten.

Remaining issues are logged locally: unmarked or damaged bullet lists, some
bibliographic headings, text absent from the PDF text layer, ambiguous glyphs,
uncertain hyphenation and manual-reference ambiguities. The 30 differences remain
counted, including suspected reference mistakes, rather than silently rewriting
references to improve the score. This pass stops at 28 additional checks after
three iterations and fresh holdout validation; it does not claim 50 checks.

Reproduce using `tools/parser-lab/check-local.mjs` with
`FOLIODUET_FULL_CONTEXT=1`, or `FOLIODUET_PDFJS_ONLY=1` for isolated spots.
`tools/parser-lab/summarize-local.mjs` compares the saved before/after JSONs and
writes local aggregate and per-page reports. The source PDF/reference corpus must
be supplied locally; it is intentionally not committed.
