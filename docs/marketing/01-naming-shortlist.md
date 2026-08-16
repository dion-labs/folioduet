# FolioDuet naming decision record

Status: FolioDuet selected; preliminary collision screen, not legal clearance.
Checked: 2026-08-16.

## Decision

Use **FolioDuet** as the product name. It best communicates simultaneous reading and listening. Complete proper trademark, company-register, app-store, social-handle, and international-language checks before investing materially in the mark.

The other finalists remain useful context:

- **InkCadence** is the most distinctive of the three and can expand beyond PDF.
- **PageCadence** is easiest to understand, but it retains the increasingly crowded `Page + audio/rhythm` naming pattern.

Use a descriptive subtitle during the first year regardless of the choice:

> `FolioDuet — read and listen to PDFs, word by word`

## Why PageEcho should change

`PageEcho` is already used by an actively marketed iPhone/iPad reader in the same category. It supports PDF/ebook import, text-to-speech, synchronized highlighting, and reading/listening workflows; it owns [page-echo.com](https://page-echo.com/) and an active [App Store listing](https://apps.apple.com/us/app/pageecho-ai-text-reader/id6755965837). It has also built branded search results through Reddit and Hacker News. This is a direct product and discoverability collision, not merely a company in an unrelated field.

The surrounding namespace is tightening too:

- [PageLilt](https://readlilt.com/) is a read-aloud browser product.
- [ListenLeaf](https://listenleaf.com/) is an iOS app that reads books, PDFs, Word documents, and legal material.
- [OpenReader](https://openreader.richardr.dev/) positions itself as an open-source synchronized document read-along.
- [Page Aloud](https://pagealoud.com/) uses the literal document-reader proposition.

This makes a coined but pronounceable mark safer than another obvious `Read`, `Listen`, or `Page` compound.

## Preliminary screen

Legend:

- **Clear in this screen:** no exact product result found, no exact GitHub repository found, exact npm package returned 404, and the `.com`/`.app` registry RDAP lookup returned 404 on the check date.
- **Watch:** an adjacent or non-product use exists, or the construction is less distinctive.
- **Reject:** an active same/adjacent-category use or exact technical asset exists.

| Candidate | Meaning / strength | Exact web screen | `.com` / `.app` RDAP | GitHub exact repo | npm exact package | Verdict |
|---|---|---|---|---|---|---|
| **InkCadence** | Text plus natural pace; distinctive and extensible | None found | no record / no record | none | none | **Advance #1** |
| **FolioDuet** | Reading and listening together | None found | no record / no record | none | none | **Selected** |
| **PageCadence** | Immediate product association and rhythm | None found | no record / no record | none | none | **Advance #3**, but generic pattern |
| ProseChime | Friendly literary/audio association | None found | no record / no record | none | none | Advance as backup |
| PageChorus | Pages brought to voice; memorable | No product found; false-positive cast-credit results | no record / no record | none | none | Watch: “chorus” can imply multiple voices |
| LineLilt | Word/line-level following with natural speech | None found | no record / no record | none | none | Watch: spelling may need repetition |
| PaperLilt | Documents plus expressive voice | None found | no record / no record | none | none | Watch: close construction to PageLilt |
| FolioLilt | Books/documents plus expressive voice | None found | no record / no record | rate-limited on final API check; no web result found | none | Watch; rerun GitHub check |
| ReadDuet | Directly says two-mode reading | Existing `#ReadDuet` campaign for a children's book | no record / no record | none | none | Watch: descriptive and less ownable |
| **WordDuet** | Strong bimodal metaphor | Exact GitHub repository exists | registered / no record | `ryanjyost/wordduet` | none | **Reject** |
| **ReadLilt** | Strong sound and reading association | Active read-aloud product at `readlilt.com` | registered / no record | none | none | **Reject** |

“No record” is not proof that a domain is purchasable: registries may reserve or premium-price names, registrations can change at any moment, and the checks did not test every country-code domain.

## How the checks were run

- Exact-name web queries with product qualifiers (`app`, `software`, `reader`) and manual review of obvious results.
- `.com` via the [Verisign RDAP service](https://rdap.verisign.com/com/v1/domain/example.com) and `.app` via [Google Registry RDAP](https://pubapi.registry.google/rdap/).
- Exact case-insensitive repository names via the [GitHub repository search API](https://docs.github.com/en/rest/search/search#search-repositories).
- Exact lowercase package names via the [npm registry API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md).

Known collision evidence:

- [`WORDDUET.COM` RDAP record](https://rdap.verisign.com/com/v1/domain/wordduet.com) and [GitHub repository search](https://api.github.com/search/repositories?q=WordDuet%20in%3Aname).
- [`READLILT.COM` RDAP record](https://rdap.verisign.com/com/v1/domain/readlilt.com) and the active [ReadLilt product](https://readlilt.com/).

## Optional post-selection validation

Show the three finalists in randomized order to 8-12 target users, without logos. Ask:

1. What do you think this product does?
2. How would you spell the name after hearing it once?
3. Which name would you trust with a PDF?
4. Which name can you recall ten minutes later?

Reject a name if more than two participants misspell it, if it is consistently interpreted as a music product, or if a new same-category result appears.

## Clearance required before launch investment

1. Search EUIPO/TMview, USPTO, WIPO Global Brand Database, and relevant national registers in software, SaaS, education, and media classes.
2. Search Apple App Store, Google Play, browser-extension stores, Product Hunt, GitHub organizations, npm, PyPI, crates.io, and container registries.
3. Check `.com`, `.ai`, `.app`, `.io`, major country-code domains, and likely typo domains through a registrar.
4. Check X, Bluesky, Mastodon, Reddit, Discord, YouTube, and GitHub organization handles.
5. Have counsel evaluate the final candidate. This document is product research, not a trademark opinion.

## Rename implementation notes

- Keep routes descriptive; do not rename `/pdf-to-audiobook` or `/read-and-listen-to-pdf` with the brand.
- 301 redirect every old branded URL to its direct replacement.
- Add `FolioDuet, formerly PageEcho` to the homepage, repository README, and release notes for at least 90 days.
- Do not repurpose the existing Google-indexed page without redirects, updated canonicals, sitemap, structured data, social cards, manifest, and Firebase/Auth-domain review.
- Avoid changing Firestore collection paths merely for branding; a user-visible rename does not require a risky data migration.
