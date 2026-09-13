# finla — marketing videos (Remotion)

Standalone Remotion project. It has its own `package.json` and `node_modules`; it is
not part of the Expo app's build.

## Compositions

| id           | Size             | Length | Purpose                               |
| ------------ | ---------------- | ------ | ------------------------------------- |
| `FinlaIntro` | 1920×1080 @30fps | 24,6 s | Web hero / intro film                 |
| `FinlaIntroPortrait` | 1080×1920 @30fps | 24,6 s | The same film, cut for story / reels |
| `FinlaOutro` | 1920×1080 @30fps | 3 s    | The end card on its own, as a stinger |

## Commands

```bash
cd video
npm i
npm run dev              # Remotion Studio (edit copy in the sidebar)
npm run lint             # eslint + tsc

npm run export           # FinlaIntro         -> out/finla-intro.mp4
npm run export:story     # FinlaIntroPortrait -> out/finla-intro-story.mp4  (9:16)
npm run export:outro     # FinlaOutro         -> out/finla-outro.mp4  (stinger)
npm run export:all       # the set

# one frame, for checking a beat without rendering the whole film
npx remotion still FinlaIntro out/f.png --frame=330
```

## 16:9 and 9:16

Camera keys aim at a point on the phone *screen* (in the 393×852 point space the UI is
authored in), not at a canvas coordinate, so one key means the same shot at any
composition size. `src/intro/timeline.ts` holds two tracks — `CAM_WIDE` and `CAM_TALL` —
and `getCamera(frame, width, height)` picks by aspect.

They are not the same path rescaled. In a tall frame the screen fills the width at about
scale 3.2, and past that the bezels — then the content — leave frame sideways. So the
vertical cut lives in a narrow band (1.8–3.2), holds the whole screen most of the time,
and moves vertically instead of zooming. Two beats invert outright: the chat thread is
bottom-anchored, so 9:16 sits low and grounds the shot on the device's bottom edge
instead of cropping in; and the invoice page fills the frame width, which makes its type
*larger* than in the wide cut's tightest close-up, so that beat is a hold and a slow
drift rather than a dive.

## How it is built

- `src/intro/timeline.ts` — the only place frames are defined: every scene beat plus the
  camera path (focus point + zoom). Change pacing here, nowhere else.
- `src/intro/Stage.tsx` — the studio backdrop (gray cyclorama, dark pedestal, contact
  shadow, vignette, grain), all CSS. The backdrop sits on a shallower parallax plane
  than the pedestal, so the push-in gains depth.
- `src/intro/Phone.tsx` — device frame using the ratios from
  `finla-web-ds/src/PhoneMockup.tsx`. Children are authored at iPhone point size
  (393×852) and scaled into the cutout, so screen typography matches the real app 1:1.
- `src/intro/screen/` — the chat UI. Colors come from `src/intro/tokens.ts`, which
  mirrors `constants/theme.ts` plus the chat-only blue-grays used in
  `components/chat/chat-screen.tsx`.
- `src/intro/screen/InvoicePreview.tsx` — the sheet "Taslağı Gör" opens before the
  invoice is issued: the chrome of `components/chat/invoice-preview-modal.tsx` around
  the e-Arşiv document the WebView renders on device. Layout, field set and wording
  were taken from a real draft exported by the app, including the details that sell it
  as genuine — no invoice number (GİB assigns one on acceptance), the `EARSIVFATURA`
  scenario, the double rules, the bank block and the "İMZASIZ TASLAK BELGESİ" stamp.
  Two deliberate departures: the seller is fictional (the real export carries the
  provider's own company details, and the provider name is never shown — see the
  Security section of the root CLAUDE.md), and type is sized for a 393pt screen rather
  than for paper, so the document is legible on camera.
- `src/intro/content.ts` — all on-screen copy, exposed as a zod schema so it is
  editable in the Studio sidebar. Turkish strings are taken verbatim from the app
  (`use-chat-stream-display.ts`, `_shared/invoice-mapper.ts`, `chat-input.tsx`).

`src/shared/` is the part that is not specific to any one film — reuse it when adding
the PR and social cuts:

- `src/shared/Outro.tsx` — the finla end card (wordmark lands, then lifts to seat the
  tagline). Composition-agnostic: type sizes come from the canvas's shorter side, so it
  holds at 16:9, 9:16 and 1:1 unchanged. Drop it in a `<Sequence>` and it reads
  `useCurrentFrame()` itself; pass `frame`/`logoAt`/`sloganAt` to drive it from a
  timeline instead, which is what `src/intro/Intro.tsx` does. Pass no `slogan` to end on
  the wordmark alone. **Every mount dissolves in over whatever is behind it** — no prop
  needed; `fadeIn={0}` gives a hard cut instead. Keep the previous shot mounted for
  `OUTRO_FADE` frames (exported from the same file) so the dissolve has something to
  dissolve over.
- `src/shared/brand.ts` — the font (loaded once for the whole project), the wordmark and
  the on-black brand colors.
- `src/shared/anim.ts` — `ramp` / `easeRamp`, the two interpolation helpers every
  composition ends up needing.

Everything animates as a pure function of `useCurrentFrame()` — no timers, no state —
so renders are deterministic and the timeline can be scrubbed freely.

## Conventions

- "Mysoft" is never shown on screen; the e-invoice provider stays generic (GİB is fine).
- Screen copy must stay in sync with the app. If a Turkish string changes in the app,
  update `src/intro/content.ts` too.
