# FolioDuet brand direction

## System

FolioDuet uses a two-layer identity:

- **Product mark:** paired pages joined by one synchronized reading-and-listening line. It must remain legible at favicon size.
- **Narrator:** a mature editorial host for onboarding and marketing. She is a reader, not an assistant, and should not appear as chat UI.
- **Living bookmark:** an optional supporting mascot for loading, empty, and celebratory states. It is not the primary mark.

The shared DionLabs family cues are a near-black rounded container, precise geometry, restrained violet and teal details, and one product-specific accent. FolioDuet owns coral and warm ivory.

## Usage

- Use `public/brand/folioduet-mark.svg` or `src/v2/components/FolioDuetMark.tsx` for product identity.
- Use `public/brand/folioduet-narrator-v1.png` in editorial onboarding and campaign compositions.
- Do not call the narrator an AI assistant or imply that she is always the active TTS voice.
- Do not place the narrator in the reading viewport; the document remains the focus.
- Keep the narrator’s adult age, short dark hair, coral-violet accent, geometric dark jacket, ivory collar, coral trim, and teal circular accessory consistent.

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

### Product mark

> Explore six original minimal marks centered on paired pages and a synchronized waveform crossing the spine. Preserve FolioDuet coral and the dark DionLabs rounded container. Use flat vector-like shapes, a strong 16px silhouette, at most three colors, and no text, faces, microphones, headphones, robots, or assistant symbols.

### Narrator

> Design an original adult woman as FolioDuet’s literary narrator and editorial host, not an AI assistant. Use mature editorial character design, short dark hair with a restrained coral-violet accent, a geometric page-like collar, dark clothing, and one tiny teal accessory. Keep the result warm, intelligent, composed, non-sexualized, and free of assistant UI.

### Living bookmark

> Design an original folded ribbon and page creature that expresses synchronized reading and listening through a single waveform line. Keep it sophisticated, compact, and non-robotic, with no chat bubbles, headphones, microphones, or excessive cuteness.

Concept sheets are retained under `docs/brand/concepts/` for future iterations.
