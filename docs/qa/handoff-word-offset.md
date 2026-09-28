# Handoff position across split paragraphs

The synthetic narrow390px -> wide1280px handoff probe opened Tall90 instead of the source page's Tall66. Both layouts had valid page5/stream4: the stream index referred to viewport-dependent paragraph fragments, not the same text.

New links optionally carry `gw`, a zero-based word offset across the entire ordered book text. Words use the same punctuation-aware tokenizer as reader/TTS highlighting, not whitespace counts. Counts sum across the finalized viewport blocks; splitting/repacking changes block boundaries but preserves the cumulative word count. The receiver resolves `gw` against its own finalized pages into page/block/word plus its local legacy stream index.

Compatibility boundaries:

- Existing `d`, `p`, `s`, `b`, `w` parameters keep their meanings and remain emitted. Old clients ignore `gw` and retain their existing behavior.
- New clients prefer a valid in-range `gw`; absent, malformed, unsafe or out-of-range values use the existing stream/page fallback. Zero is valid.
- Pending handoffs may retain the optional field under the existing storage key. No key/Firestore namespace is renamed.
- Library progress fields are unchanged. This fixes new handoff links only; automatically synced positions inside viewport-split paragraphs still require separate acceptance/design. No production data migration is performed.
- Both devices must have the same processed text. Re-extraction/content changes are a separate document-version problem; a word offset is not a content identity proof.

Acceptance: helper round trips across differing block/page partitions, strict parsing/compatibility, stored pending target, and actual narrow->wide and wide->narrow synthetic browser links. The receiver must show the source anchor text and select the corresponding word after its final target layout commits.
