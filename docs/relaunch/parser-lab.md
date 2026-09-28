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
