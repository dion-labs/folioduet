# Processing strategies: ownership and applicability

## Audit and change

FolioDuet's `pageecho` processor is PDF.js; `anydoc` is AnyDoc WASM. Both produce source Markdown and converge on `buildBookStream`. Markdown ZIPs, catalog content, and synced pages also reach that stream builder.

The audit found three discrepancies:

1. PDF.js deleted a hyphen whenever the next text item began with a lowercase letter. This could turn a compound such as `long-term` into `longterm`. AnyDoc instead retained uncertain compounds and only joined fragments when the document contained an unhyphenated example without conflicting compound evidence.
2. That conservative repair lived in `anydocPdf.ts`, so PDF.js, older synced extracts, and Markdown archives missed it. Evidence was also tied to each adapter's output shape: PDF.js emits multiple pages, whereas AnyDoc emits one continuous source document.
3. The AnyDoc evaluation CLI saved raw WASM output despite documenting its output as the Markdown used by the app.

`documentNormalization.ts` now owns the common post-extraction rules. The PDF orchestrator applies them after either adapter, including fallback. `buildBookStream` also applies the same idempotent rules when reading archived or persisted source pages. The evaluation CLI imports that implementation. Word evidence spans the complete source document without merging source-page boundaries.

## Strategy inventory

| Strategy | Owner | Applicability and reason |
| --- | --- | --- |
| Read PDF text items, punctuation spacing, EOL handling | `pdfStream.ts` PDF.js adapter | PDF.js text-item API only; preserve hyphens for later repair. |
| Reconstruct physical wrapped lines and infer paragraph-sized blocks | `pdfStream.ts` PDF.js adapter | Unstructured PDF.js lines only. Applying this to structured Markdown would flatten headings, lists, or tables. Reconstruction retains a spaced hyphen for the common decision. |
| Local WASM conversion, byte transfer, worker lifecycle | `anydocPdf.ts` / `anydocPdf.worker.ts` | AnyDoc only; the adapter returns raw Markdown. |
| Yield every four source pages, destroy PDF resources | `pdfStream.ts` PDF.js adapter | PDF.js's page loop; AnyDoc uses a worker to keep synchronous WASM off the UI thread. |
| AnyDoc failure or empty-output fallback | `extractPdfMarkdown` in `pdfStream.ts` | Orchestration policy; the fallback output receives the same common normalization. Requested/used processor reporting stays intact. |
| Line-ending normalization, empty-source filtering, final newline | `normalizeExtractedMarkdownPages` | Every source Markdown route. Leading indentation is preserved. |
| Evidence-based wrap repair | `documentNormalization.ts` | Every source Markdown route; join only with document-wide lexical evidence and no conflicting compound evidence. Otherwise remove wrap spacing but retain the hyphen. |
| Protect code, URLs, link destinations, reference definitions, pipe tables | `documentNormalization.ts` | Shared guardrails for wrap repair, independent of extractor identity. |
| Legacy toolbar chrome and `pe:` annotations | `documents.ts` | Applied when the input contains that legacy syntax, regardless of processor. |
| Bare page numbers, Roman/OCR-like page numerals, numbered running headings, early document-title removal | `prepareMarkdownPage` in `documents.ts` | Already shared by all stream inputs; evidence is limited to the available source page. |
| Plain leading title inference | `extractPlainChapterTitle` in `documents.ts` | Shared, conditional on the source having no recognized chapter heading. |
| Heading levels, explicit chapter signals, wrapped title joining, adjacent chapter deduplication | `documents.ts` | Already shared; rules depend on Markdown structure, not engine name. |
| Markdown entities, inline formatting, links, lists/tables, speech projection and word tokens | `src/hooks/useTTS.ts` | Already shared by the reader; downstream of extraction and repair. |
| Chapter navigation filtering, duplicate entries, following-body threshold | `chapters.ts` | Already shared. Navigation eligibility is a separate policy from a visual chapter/page break. |
| Oversized-block splitting, height/word packing, viewport measurement/cache, resume anchors | `bookStream.ts`, `measureBookStream.ts`, `viewportPackCache.ts` | Already shared by all reading streams; independent of the extraction engine. |

## Pipeline contract

```text
PDF.js text items -> line/paragraph reconstruction --+
AnyDoc WASM ------> raw Markdown -------------------+-> shared normalization -> source pages for sync

PDF source pages / Markdown ZIP / catalog / synced pages
  -> shared normalization (idempotent)
  -> shared structure, furniture and chapter rules
  -> shared rendering/speech stream
  -> shared pagination and chapter navigation
```

New generic text repairs belong in `documentNormalization.ts`, with tests through both extraction routes. New semantic rules belong in the shared stream builder/parser. Engine adapters should only interpret their own APIs or output representations; do not add processor-name checks to generic repair or semantic code.

## Validation

- Route matrix covers PDF.js, AnyDoc, and AnyDoc-to-PDF.js fallback with identical expected repairs, including physical EOL and text-item fragment boundaries.
- An invented PDF is converted by the actual PDF.js and AnyDoc WASM engines, then checked through the reading stream for joined words and preserved compounds.
- Shared tests cover document-wide evidence, preserved source boundaries, conflicting/uncertain compounds, protected Markdown, indentation, empty output, and idempotence.
- Stream regression verifies that archived/synced source text has matching Markdown, rendered text, and inline speech runs after repair.
- Existing structure, chapter, speech, pagination, sync, and other application tests remain applicable.

## Limits

This makes applicable policies consistent; it does not make the engines' raw layout interpretation identical. PDF.js retains physical page boundaries; AnyDoc currently exposes one continuous Markdown string. Rules requiring physical coordinates or true page boundaries cannot be applied to AnyDoc without additional source metadata. No OCR, missing-text recovery, new reading-order algorithm, or general cross-page word joining is introduced.

The wrap rule recognizes spaced fragments within a logical line. PDF.js reconstructs its physical wrapped lines first. Arbitrary soft newlines inside structured Markdown are not flattened, because doing so can damage Markdown structure. Existing page-furniture and chapter-inference heuristics retain their current limitations; they already run for both engines.

Existing synced source text is normalized when opened. Previously deleted hyphens cannot be recovered from that text alone; reopening the original PDF re-extracts it. Existing pagination caches are keyed from the resulting stream. No bulk modification of stored libraries is performed.

The evaluation CLI imports the shared TypeScript module directly and requires Node 22.18+ (native type stripping).
