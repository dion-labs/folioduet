# High-intent SEO page briefs

Status: content and implementation brief; not yet published.
Research date: 2026-08-16.

## Shared requirements

Both pages must return unique, crawlable HTML at a stable `200` URL. Do not serve only the generic SPA metadata and expect client-side copy swaps to carry SEO.

For each page:

- self-referencing canonical;
- unique `<title>`, meta description, H1, Open Graph title/description/image, and social card;
- inclusion in `sitemap.xml` and an internal link from the homepage/footer or a visible resources section;
- `SoftwareApplication` structured data only for claims visible on the page; FAQ markup may help machines understand the content but should not be expected to produce a Google rich result;
- one real screenshot or short muted/accessible demo, with descriptive alt text and a text transcript;
- fast mobile first paint and a visible CTA before the first viewport ends;
- event tracking keyed by landing path and CTA, without bypassing analytics consent;
- plain-language privacy disclosure near upload/play: the original PDF stays on the import device; extracted text may sync under the user's account; text selected for neural narration is sent to the configured TTS provider.

Do not claim scanned-PDF/OCR support, downloadable MP3/audiobook export, offline neural narration, or that nothing leaves the device unless those behaviours are actually implemented and verified.

Current results commonly promise browser use, no signup, local processing, natural voices, or exported audio—see [Page Aloud](https://pagealoud.com/), [AeroPDF](https://aeropdf.app/pdf-to-audio), [AudioDoc](https://www.docstoaudio.com/), [IReadAll](https://ireadall.ai/pdf-reader), and [OpenReader](https://openreader.richardr.dev/). FolioDuet's strongest concrete angle is synchronized word-level reading plus optional cross-device progress, demonstrated rather than asserted.

---

## Page 1: `/pdf-to-audiobook`

### Search intent

The visitor wants to upload a PDF and hear it as an audiobook, often expecting natural speech, no installation, and possibly an audio download.

Primary query:

- `pdf to audiobook`

Secondary cluster:

- `turn pdf into audiobook`
- `pdf audiobook converter`
- `convert pdf to audio online`
- `listen to pdf like audiobook`
- `pdf to speech no signup`

### Promise and honesty boundary

Promise an **audiobook-style listening experience**, not a downloadable audiobook file. State the limitation before the FAQ:

> FolioDuet streams narration while you read. It does not currently export an MP3 or M4B file.

### Metadata

- **Title:** `PDF to Audiobook Reader — Listen in Your Browser | FolioDuet`
- **Meta description:** `Import a text-based PDF, hear natural narration, and follow each spoken word on screen. Try the sample or use your own PDF without creating an account.`
- **H1:** `Turn a PDF into an audiobook-style read-along`
- **Canonical:** `https://pageecho.dionlabs.ai/pdf-to-audiobook`

### Above-the-fold copy

Eyebrow: `PDF TO AUDIOBOOK-STYLE READING`

Headline:

> Turn a PDF into something you can listen to

Supporting copy:

> Import a text-based PDF, press play, and follow every spoken word as it is highlighted. No account required to try it.

Primary CTA: `Choose a PDF`
Secondary CTA: `Play the 30-second demo`

Microcopy below CTA:

> Original PDFs stay on this device. Neural playback sends the text being narrated to the selected speech provider. [Privacy details]

### Page structure

1. **Interactive proof:** short demo or live sample with visible word highlighting.
2. **Three steps:** choose PDF → FolioDuet extracts selectable text → listen and follow along.
3. **Why it is different:** word-level synchronization, automatic page progression, remembered place, browser-based guest trial, open source.
4. **Good fits:** long reports, papers, text-based books, manuscripts, course readings.
5. **Known limits:** no OCR for image-only scans; extraction quality follows the PDF's text layer; no MP3/M4B export; neural TTS needs a network connection.
6. **Privacy and sync:** original vs extracted text vs narrated text, described separately.
7. **Open-source proof:** link to the repository and relevant license.
8. **FAQ.**
9. **Final CTA:** `Listen to your PDF` plus `Try the sample`.

### FAQ answers to write

- **Can I turn a PDF into an audiobook for free?** Explain the current guest trial and that Fish Audio's sponsored availability may change; do not promise unlimited permanent service.
- **Can I download an MP3?** No; playback currently streams in the reader.
- **Does it work with scanned PDFs?** Only PDFs with a usable text layer; OCR is not currently promised.
- **Do I need an account?** No to try/import locally; explain what signing in adds.
- **Is my PDF uploaded?** Original PDF stays on the import device; explain extracted-text sync and provider processing accurately.
- **Can I continue on another device?** Explain sign-in, processed-text/progress sync, and that the original PDF is not copied as a binary.

### Conversion events

- `seo_pdf_audiobook_demo_start`
- `seo_pdf_audiobook_import_open`
- existing import success/failure events with landing-path property
- own-document playback and three-minute activation with landing-path property

### Internal links

- Link to `/read-and-listen-to-pdf` with anchor `read and listen to a PDF at the same time`.
- Link to Privacy and GitHub.
- The second page should link back with anchor `listen to a PDF like an audiobook`.

---

## Page 2: `/read-and-listen-to-pdf`

### Search intent

The visitor specifically wants simultaneous audio and visible text—often word or sentence highlighting—to maintain focus, follow pronunciation, or avoid losing their place.

Primary query:

- `read and listen to pdf at the same time`

Secondary cluster:

- `pdf reader with word highlighting and text to speech`
- `listen to pdf while reading`
- `pdf read aloud follow along`
- `text to speech word by word highlighting pdf`
- `bimodal pdf reader`

Use “bimodal” as explanatory language later on the page, not as the primary headline; most visitors search in plain language.

### Metadata

- **Title:** `Read and Listen to a PDF at the Same Time | FolioDuet`
- **Meta description:** `Hear a PDF read aloud while each spoken word is highlighted on screen. Import a text-based PDF or try the synchronized demo in your browser.`
- **H1:** `Read and listen to your PDF at the same time`
- **Canonical:** `https://pageecho.dionlabs.ai/read-and-listen-to-pdf`

### Above-the-fold copy

Eyebrow: `SYNCHRONIZED PDF READ-ALONG`

Headline:

> Hear the words. See your place.

Supporting copy:

> FolioDuet reads your PDF aloud while highlighting the current word, so your eyes and ears stay on the same line.

Primary CTA: `Try the synchronized demo`
Secondary CTA: `Choose my PDF`

Place the visual read-along proof in the first viewport; a static bookshelf does not satisfy this query.

### Page structure

1. **Visible proof:** autoplay-muted video or click-to-play sample showing the highlight moving in sync.
2. **What simultaneous reading means:** narration, current-word highlight, page progression, speed control, resuming position.
3. **Who it may help:** readers handling dense material, language learners checking pronunciation, people who prefer multisensory focus. Avoid unqualified medical or comprehension-improvement claims.
4. **One reading surface:** contrast with juggling a PDF window and a separate audio player without naming or disparaging competitors.
5. **How to start:** demo → import a text-based PDF → press play.
6. **Limits and privacy:** same factual disclosure as page 1.
7. **FAQ.**
8. **Final CTA.**

### FAQ answers to write

- **Does FolioDuet highlight every word as it reads?** Describe the verified behaviour and any mode/provider limitations.
- **Can I click a word or passage to start there?** Only answer yes if the production interaction is verified.
- **Will it keep turning pages?** Describe actual automatic page behaviour and edge cases.
- **Can I change the voice and speed?** Describe current settings without promising every browser/provider.
- **Does it work on phone and desktop?** Name tested browsers/devices after QA; do not claim universal support.
- **Does it support image-only/scanned PDFs?** State the text-layer requirement.

### Conversion events

- `seo_read_listen_demo_start`
- `seo_read_listen_demo_30s`
- `seo_read_listen_import_open`
- own-document playback and three-minute activation with landing-path property

## Editorial QA for both pages

- Every feature claim can be reproduced on the production URL in a fresh browser profile.
- The demo works without sign-in and without scrolling on a common phone viewport.
- “Free” copy has a visible qualifier while sponsored neural TTS is temporary.
- “Private” copy distinguishes originals, extracted/synced text, analytics, and TTS processing.
- No duplicate paragraphs across the two pages beyond necessary product/privacy facts.
- Screenshots and video reflect the current UI and final product name.
