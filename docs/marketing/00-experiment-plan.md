# FolioDuet marketing experiment plan

Status: implementation-ready draft; no outreach has been sent.
Research date: 2026-08-16.

## Decision this plan is designed to make

Decide whether FolioDuet has an activation problem, a positioning problem, or only a distribution problem before spending another launch on broad traffic.

The working activation is:

> A visitor imports their own PDF, starts playback, and listens for at least three cumulative minutes.

Anonymous Firebase profiles, sample imports, and registrations are supporting signals, not activation. The current count of 84 guest profiles must not be presented as 84 unique people until deduplication and bot filtering exist.

## Launch gates

Do not start the public distribution sequence until all four gates pass:

1. The activation funnel records landing source, demo start, import success/failure, own-document playback, three-minute listening, signup prompt, signup completion, and return visits.
2. A one-click demo can show synchronized highlighting without requiring registration.
3. The first screen states the concrete outcome and has a visible primary action on mobile and desktop.
4. The FolioDuet identity is consistent across product metadata and launch assets, with a concise PageEcho migration note.

## Fourteen-day sequence

### Days 1-2: establish a trustworthy baseline

- Use one acquisition taxonomy everywhere:
  - `utm_source=x&utm_medium=social&utm_campaign=activation_launch`
  - `utm_source=hermes&utm_medium=community&utm_campaign=activation_launch`
  - `utm_source=fishaudio&utm_medium=community&utm_campaign=activation_launch`
  - organic landing pages retain the initial referrer and landing path.
- Build a funnel view by anonymous installation/user ID, with a separate session count.
- Exclude known development traffic and clearly label consent-limited analytics.
- Record the current baseline without retroactively attributing the two recent users to Google.

### Days 3-7: ten observed user sessions

Recruit ten people who already have a specific PDF they intend to read: students, researchers, manuscript reviewers, or long-form readers. Do not ask them to explore the app abstractly.

Session prompt:

> Bring one PDF you have been meaning to finish. Use this however you naturally would while sharing your screen. I will stay quiet unless you become completely stuck.

Capture:

- whether they can explain the product after five seconds;
- time to first demo playback;
- time to import their own PDF;
- every hesitation or error during import/playback;
- whether they reach three listening minutes;
- what they believe is stored or sent to third parties;
- whether they return unaided within seven days.

Avoid “Would you use this?” as a success signal. Behaviour and a concrete return are stronger.

### Days 5-9: package proof, not promises

- Record the 20-30 second video in `03-demo-and-distribution-copy.md` using a real text-layer PDF.
- Publish the two search-intent pages in `02-seo-page-briefs.md` only after their CTAs and event tracking work.
- Verify titles, canonicals, crawlable HTML, sitemap entries, mobile layout, Open Graph cards, and real-device playback.
- Keep PageEcho in a short migration note for several months; if the external host or repository slug changes later, redirect every old URL to its direct replacement.

### Days 10-14: distribute one asset sequentially

Use the same demo video and message core, but send channels 24-48 hours apart so outcomes remain interpretable:

1. standalone X post;
2. Hermes follow-up;
3. Fish Audio `api-showcase` submission.

Do not repost the same copy verbatim. Reply to useful questions and log objections as product/landing-page inputs. Do not add Show HN, Product Hunt, paid ads, or generic directories in this cycle.

## Scorecard

| Level | Metric | Why it matters |
|---|---|---|
| Primary | Own PDF + at least 3 minutes listened | Evidence of the promised value |
| Diagnostic | Demo started / qualified landing views | First-screen clarity |
| Diagnostic | Own-PDF import succeeded / import opened | Import reliability |
| Diagnostic | Playback started / import succeeded | Reader and TTS handoff |
| Secondary | Signup after activation | Save/sync demand, without front-loading registration |
| Retention | Activated user returns on day 1 and day 7 | Repeat usefulness |
| Channel | Activated users / tagged qualified visits | Distribution quality |

For this small sample, report raw counts alongside rates. A jump from one to two users is 100% growth but weak evidence.

## Go / iterate / stop rules

- **Go to broader distribution:** at least 5 of 10 recruited testers activate and at least 2 return within seven days, with no repeated severe import/playback failure.
- **Iterate the product/message:** fewer than 5 activate, or the same hesitation appears in at least 3 sessions.
- **Pause a channel:** it produces at least 20 qualified landing visits but zero own-PDF activations. Diagnose message-to-product mismatch before posting there again.
- **Keep SEO running:** pages earn relevant impressions even before clicks; revise title/intro when impressions rise but CTR remains weak. Avoid conclusions from fewer than roughly 100 impressions.

## Attribution notes

- Preserve first-touch source separately from last-touch source.
- A direct return after an X click should not erase the initial X attribution.
- Record landing path so `/pdf-to-audiobook` and `/read-and-listen-to-pdf` can be compared.
- Do not fingerprint visitors. Use the existing privacy/consent design and aggregate where necessary.

## Current market constraint

The “PDF to audio” result set is already crowded with browser tools promising no signup, local processing, or audiobook conversion—for example [Page Aloud](https://pagealoud.com/), [AeroPDF](https://aeropdf.app/pdf-to-audio), [AudioDoc](https://www.docstoaudio.com/), and [OpenReader](https://openreader.richardr.dev/). FolioDuet should therefore lead with the visible synchronized read-along experience and a real product demonstration, not with “PDF text-to-speech” alone.

Fish Audio currently documents `s2.1-pro-free` as free through August 31, 2026, subject to fair use and without SLA or latency guarantees. Treat the remaining period as a learning window, and do not imply permanent free neural narration. Source: [Fish Audio S2.1 Pro announcement](https://fish.audio/ar/blog/s2-1-pro-free-api/?articleLocale=en).
