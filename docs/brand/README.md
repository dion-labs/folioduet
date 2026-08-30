# FolioDuet brand direction

## System

FolioDuet uses a two-layer identity:

- **Living bookmark:** the orange folded bookmark and page creature is the primary product mark. Its central waveform carries the synchronized reading-and-listening idea.
- **Narrator:** a mature editorial host for onboarding and marketing. She is a reader, not an assistant, and should not appear as chat UI.

The shared DionLabs family cues are a near-black rounded container, precise geometry, restrained violet and teal details, and one product-specific accent. FolioDuet owns coral and warm ivory.

## Usage

- Use `public/brand/folioduet-mascot-monochrome-v6.png` or `src/v2/components/FolioDuetMark.tsx` for compact product identity. The original `folioduet-mascot-v1.png` remains the larger illustrative variant.
- Use `public/brand/folioduet-mark.svg` where a small deterministic vector is preferable, including the favicon.
- Use `public/brand/folioduet-narrator-tattoo-v3.png` in editorial onboarding and campaign compositions.
- Use the mascot sparingly in loading, empty, and celebratory states; it should feel like a recurring reading companion, not UI chrome.
- Do not call the narrator an AI assistant or imply that she is always the active TTS voice.
- Do not place the narrator in the reading viewport; the document remains the focus.
- Keep the narrator’s adult age, short dark hair, coral-violet accent, geometric dark jacket, ivory collar, coral trim, and teal circular accessory consistent.
- Keep the clustered black resonance mark consistent between the compact mascot and the back of the narrator's forward hand. The compact mascot is monochrome; teal remains a narrator detail.

## Palette

| Role | Value |
| --- | --- |
| Ink | `#171a18` |
| Paper | `#fff7f2` |
| FolioDuet coral | `#f06e4f` |
| DionLabs violet | `#8f79e8` |
| DionLabs teal | `#4de3d3` |

## Public usage counters

Never advance a public counter from a projected growth rate. Projections may be used internally, but displayed usage must be observed and auditable.

For the current stage, use a rounded, manually verified statement such as `Tried in 130+ private guest sessions`. Before showing a book count, exclude developer test documents and the bundled sample.

If counters become dynamic, expose only a server-written aggregate document such as `public_metrics/folioduet`. Clients may read it but must never be able to write it, and the existing owner-only `pageecho/{uid}` rules must remain unchanged.

## Generated exploration prompts

The concepts were generated with the built-in image-generation workflow. The production mark was then rebuilt as deterministic SVG.

### Product mark exploration

> Explore six original minimal marks centered on paired pages and a synchronized waveform crossing the spine. Preserve FolioDuet coral and the dark DionLabs rounded container. Use flat vector-like shapes, a strong 16px silhouette, at most three colors, and no text, faces, microphones, headphones, robots, or assistant symbols.

### Narrator

> Design an original adult woman as FolioDuet’s literary narrator and editorial host, not an AI assistant. Use mature editorial character design, short dark hair with a restrained coral-violet accent, a geometric page-like collar, dark clothing, and one tiny teal accessory. Keep the result warm, intelligent, composed, non-sexualized, and free of assistant UI.

### Living bookmark / production mascot

> Design an original folded ribbon and page creature that expresses synchronized reading and listening through a single waveform line. Keep it sophisticated, compact, and non-robotic, with no chat bubbles, headphones, microphones, or excessive cuteness.

The chosen orange concept was extracted into a polished, transparent production asset with the same coral folded-ribbon body, warm ivory page wings, and charcoal waveform. It is now the primary FolioDuet mark.

Concept sheets are retained under `docs/brand/concepts/` for future iterations.
