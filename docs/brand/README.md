# FolioDuet brand direction

## System

FolioDuet uses one character identity: its mature editorial narrator. Her headshot is the primary product mark, while larger reading poses support onboarding, empty states, loading states, and marketing. She is a reading companion, not a chat bot, and should not appear as chat UI.

The shared DionLabs family cues are a near-black rounded container, precise geometry, restrained violet and teal details, and one product-specific accent. FolioDuet owns coral and warm ivory.

## Usage

- Use `public/brand/folioduet-narrator-avatar-v1.png` through `src/v2/components/FolioDuetAvatar.tsx` for the primary mark, compact loading states, and small portraits.
- The favicon, install icons, and social summary icon are resized compositions of that same headshot.
- Use `public/brand/folioduet-narrator-v1.png` as the compact reading variation in empty states.
- Use `public/brand/folioduet-narrator-tattoo-v4.png` in editorial onboarding and campaign compositions.
- Do not call the narrator an AI assistant or imply that she is always the active TTS voice.
- Do not place the narrator in the reading viewport; the document remains the focus.
- Keep the narrator’s adult age, short dark hair, coral-violet accent, geometric dark jacket, ivory collar, coral trim, and teal circular accessory consistent.
- Keep the clustered black resonance mark on the back of the narrator's forward hand when that hand is visible.

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

The narrator and her avatar were generated with the built-in image-generation workflow. The two production images above are the canonical visual references for every future pose.

### Narrator

> Design an original adult woman as FolioDuet’s literary narrator and editorial host, not an AI assistant. Use mature editorial character design, short dark hair with a restrained coral-violet accent, a geometric page-like collar, dark clothing, and one tiny teal accessory. Keep the result warm, intelligent, composed, non-sexualized, and free of assistant UI.

### Avatar

> Create a circular-safe head-and-shoulders portrait of the same FolioDuet narrator. Preserve her exact adult facial identity, swept short black hair with restrained magenta streaks, brown eyes, turquoise earring, black editorial jacket, ivory collar, coral trim, and calm literary-host expression. Keep the background genuinely transparent and the face legible at 28–40 px.
