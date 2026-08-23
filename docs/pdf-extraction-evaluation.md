# PDF extraction evaluation

This workflow turns defects found in real PDFs into generic, non-copyrighted regression tests.

## Safety boundary

Keep source PDFs, extracted Markdown, rendered pages, screenshots, and document-specific notes under `local-evals/`. That directory is ignored by Git. Before every commit, confirm that no source-derived artifact is staged.

Commit only:

- Generic extraction or normalization changes.
- Synthetic fixtures that reproduce a layout pattern without copying source text.
- Regression tests and aggregate, content-free metrics.
- Improvements to this evaluation framework.

Do not commit:

- PDFs or page images.
- Extracted Markdown or long quotations.
- Document titles, filenames, hashes, or absolute paths from a private evaluation session.
- Rules keyed to a particular title, author, page, or sentence.

## Create a local baseline

The extraction helper intentionally refuses to write outside `local-evals/`:

```bash
node tools/pdf-eval/extract-anydoc.mjs \
  --input "/absolute/path/to/book.pdf" \
  --output "local-evals/book-001/anydoc.md"
```

It writes the Markdown used by FolioDuet's AnyDoc path and a local metadata file containing the source hash, extractor version, and extraction time.

## Observation format

Store observations in a local `observations.json` file. Each observation should use this shape:

```json
{
  "id": "obs-001",
  "pdfPage": 12,
  "printedPage": "x",
  "category": "header-footer",
  "severity": "medium",
  "pipelineStage": "extraction",
  "symptom": "A repeated running header appears inside the paragraph flow.",
  "expectedBehavior": "Repeated running furniture should be excluded from reading content.",
  "markdownLocator": "lines 140-142",
  "status": "open",
  "notes": ""
}
```

Describe the defect rather than copying source prose. A short token or locator may be kept locally when needed to find it again.

### Categories

- `reading-order`
- `header-footer`
- `paragraph-boundary`
- `hyphenation`
- `glyph-ligature`
- `heading`
- `list`
- `emphasis`
- `footnote`
- `page-boundary`
- `missing-text`
- `duplicate-text`
- `table`
- `image-caption`
- `markdown-syntax`
- `tts-text`
- `other`

### Pipeline stages

- `pdf-source`: the source PDF itself is ambiguous or malformed.
- `extraction`: characters, ordering, or blocks are wrong before interpretation.
- `structure`: extracted content is assigned the wrong semantic role.
- `markdown-rendering`: the structured content is serialized or displayed incorrectly.
- `tts-text`: the speech projection contains markup or omits semantic pauses.

### Severity

- `low`: cosmetic; meaning and speech remain clear.
- `medium`: distracting or structurally wrong, but recoverable by the reader.
- `high`: changes meaning, reading order, or spoken output materially.
- `blocking`: content is unusable or missing.

## Fix loop

1. Reproduce the observation against the frozen local baseline.
2. Identify the earliest pipeline stage where it becomes wrong.
3. Build a small synthetic fixture with invented text and the same structural pattern.
4. Add a failing regression test.
5. Implement one generic rule.
6. Re-run the synthetic suite and the complete local document.
7. Mark the local observation `fixed`, `improved`, `wont-fix`, or `needs-design`.

Prefer invariants over full-document golden files. Examples include removing a header repeated across most pages, preserving paragraph order, joining a line-break hyphen only when both fragments form a word, and projecting Markdown links to speakable link text without punctuation tokens.
