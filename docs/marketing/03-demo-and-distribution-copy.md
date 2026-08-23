# Demo storyboard and distribution copy

Status: drafts only. Nothing in this file has been published or sent.
Prepared: 2026-08-16.

Product name: **FolioDuet**. Use `folioduet.dionlabs.ai` as the canonical product URL. Keep `pageecho.dionlabs.ai` as a permanent migration redirect and use `github.com/dion-labs/folioduet` as the canonical repository link.

## 25-second demo video

Format master at 1080×1920 vertical, with a 1080×1080 safe center crop. Export captions burned in because most social playback starts muted. Also export a clean version for the landing pages with an adjacent transcript.

Current mobile-first working export: [`assets/folioduet-x-demo-v1.mp4`](assets/folioduet-x-demo-v1.mp4). It is a 390×844 H.264/AAC MP4 using real Fish Audio output and finishes on the production QR handoff. Keep this as the compact X version; make a larger vertical master only if a distribution channel visibly degrades it.

Use a public-domain, text-layer PDF with a visually recognizable page. Do not use a private tester document or a scanned PDF. Record real production behaviour; cuts may remove waiting time but must not imply impossible speed.

| Time | Picture | On-screen text | Audio / production note |
|---|---|---|---|
| 0:00-0:03 | Open on the mobile reader already speaking, with the current word visibly tracking the Fish Audio narration. | `Read and listen at the same time` | Lead with the payoff. Keep real Fish audio. |
| 0:03-0:07 | Briefly show the one-click demo entry and the reader opening. | `One click to try it` | Compress only real waiting time; do not imply an instant PDF import. |
| 0:07-0:17 | Let the passage play. Keep 2-3 lines readable while the highlight advances, then show one speed or seek interaction. | `Every spoken word stays in view` | Use the public catalog sample and preserve natural punctuation. |
| 0:17-0:21 | Tap the phone handoff control from the reader. | `Keep your place anywhere` | Do not tour settings or other secondary controls. |
| 0:21-0:25 | Hold on the real handoff dialog and scannable QR code long enough for a viewer to use it. | `Scan to continue` / `No account needed for this sample` | Keep `FolioDuet` and the clean launch URL visible without covering the QR code. |

Small end-card disclosure:

> Original PDF stays on the import device. Neural narration processes played text through the selected TTS provider.

### Accessibility and QA

- Captions match the exact spoken passage but do not cover the in-product word highlight.
- Contrast passes WCAG AA; avoid rapid zooms or flashing.
- The demo remains understandable muted.
- The PDF title, browser profile, bookmarks, API keys, email, and Firebase identifiers are not visible.
- Verify the URL and product name on the export frame by frame.
- Obtain permission for the voice/model used, and avoid implying Fish Audio endorses the product.

## Standalone X post

Attach the video. A link can go in the first reply if preserving a clean video-first post is preferred.

### Main post

> I kept putting off long PDFs, so I built FolioDuet: drop in a PDF, press play, and follow every word as Fish Audio reads it aloud.
>
> It works in your browser, needs no account to try, and is open source.
>
> Here is the whole flow in 25 seconds ↓

### First reply

> Try it: https://folioduet.dionlabs.ai/x
>
> Source: https://github.com/dion-labs/folioduet
>
> It currently works best with text-based PDFs; scanned/image-only PDFs are not supported yet.

FolioDuet is the current product name; the `pageecho` links remain valid during infrastructure migration.

### Reply to the original PageEcho post

> PageEcho is now FolioDuet.
>
> The idea is the same; the first run is much better: try the demo in one click, then import your own PDF and follow every word as Fish Audio reads.
>
> No account required:
> https://folioduet.dionlabs.ai/x-update

Attach the same mobile video. This reply exists for migration and continuity; the standalone post and community submissions remain the discovery surfaces.

### Optional follow-up after real data exists

> The number I care about is not signups—it is whether someone imports their own PDF and listens for 3+ minutes. After `[N]` qualified visitors: `[A]` imported, `[B]` reached 3 minutes, and `[C]` returned. The biggest friction was `[OBSERVED FRICTION]`; here is what changed: `[CHANGE]`.

Never fill these placeholders with anonymous-profile counts.

## Hermes Discord follow-up

Post only after the tracked demo and first-run changes are live.

> Follow-up on FolioDuet (formerly PageEcho), the browser PDF read-along I shared here earlier.
>
> The first version dropped people into an empty library and asked them to infer too much. I have changed the first run around one concrete action: play a short synchronized demo, then import your own PDF without creating an account.
>
> The reader uses Fish Audio narration and follows the spoken word on screen. Original PDFs stay on the importing device; text being narrated is processed by the configured TTS provider, and signed-in users can sync extracted reading text/progress.
>
> 25-second demo: `[VIDEO OR DIRECT VIDEO LINK]`
> Try it: https://folioduet.dionlabs.ai/hermes
> Source: https://github.com/dion-labs/folioduet
>
> I am looking for very specific feedback: where do you hesitate between landing, playing the demo, and starting your own PDF? If you try it, please tell me the browser/device and whether the PDF had selectable text.

Do not lead with the old “84 users” figure. If results are included later, distinguish browser profiles/sessions from people and registrations.

## Fish Audio community submission

Fish Audio's latest community update invites builder projects to the Discord `🛠️｜api-showcase` channel and says the team is looking to feature community work. Source: [Fish Audio update, August 6-12](https://www.reddit.com/r/FishAudio_Official/comments/1vmx5jy/fish_audio_update_aug_6_aug_12/) and the official [Fish Audio Discord listing](https://discord.com/servers/fish-audio-1214047546020728892).

Submit to `api-showcase`, not `voice-models`, unless the post is specifically about a published voice model.

> **FolioDuet — synchronized PDF reading with Fish Audio**
>
> I built an open-source browser reader that lets someone import a text-based PDF, press play, and follow the current word while Fish Audio narrates it. I am using Fish's timestamped TTS response to keep playback and the reading surface aligned.
>
> Demo (25 sec): `[ATTACH VIDEO]`
> Try it: https://folioduet.dionlabs.ai/fish
> Source: https://github.com/dion-labs/folioduet
>
> No account is required to try it. The original PDF stays on the importing device; text selected for neural playback is sent for TTS processing.
>
> I would especially value feedback from Fish builders on two things:
> 1. where word timing feels early or late across punctuation and longer sentences;
> 2. voice/settings choices that work well for long-form listening rather than short clips.
>
> Current limitation: it needs a PDF with selectable text and does not export an MP3/M4B.

Do not claim an official partnership, use Fish's logo without permission, or imply the temporary free API is a permanent FolioDuet entitlement. Fish Audio currently states that `s2.1-pro-free` runs through August 31, 2026 under fair use, without SLA or latency guarantees: [official announcement](https://fish.audio/ar/blog/s2-1-pro-free-api/?articleLocale=en).

## Asset checklist before any post

- FolioDuet name and current `pageecho` URLs consistent;
- production import/playback smoke-tested in a fresh desktop and mobile browser;
- branded campaign paths tested and attributed correctly without visible UTM parameters;
- video has burned-in captions and no secrets/personal files;
- repository and privacy links return `200`;
- analytics events verified only under the intended consent state;
- someone other than the author watches the final export once for claim accuracy;
- publish channels sequentially, preserving timestamps and results in the experiment scorecard.
