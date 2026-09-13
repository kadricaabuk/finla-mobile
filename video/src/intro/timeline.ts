import { Easing, interpolate } from "remotion";
import { PHONE_BORDER, PHONE_H, SCREEN_SCALE } from "./tokens";
import { phoneCenter, type Camera } from "../shared/camera";

export type { Camera };

export const FPS = 30;
export const DURATION = 738; // 24.6 s

/**
 * Single source of truth for every event in the video. All animation is a pure
 * function of the current frame — no timers, no component state — so the render
 * is deterministic and the Studio timeline can be scrubbed freely.
 */
export const T = {
  PROMPTS_IN: 10,
  KEYBOARD_OPEN: 88,
  TYPE_START: 128,
  TYPE_END: 186,
  SEND_PRESS: 190,
  USER_BUBBLE: 194,
  KEYBOARD_CLOSE: 195,
  THINK_START: 206,
  THINK_STEP_2: 234,
  THINK_STEP_3: 262,
  ASSIST_START: 294,
  ASSIST_TEXT_END: 326,
  CARD_IN: 322,
  CARD_ROWS: 334,
  CARD_BUTTONS: 358,
  PREVIEW_TAP: 368,
  PREVIEW_OPEN: 372,
  PREVIEW_SCROLL_START: 440,
  PREVIEW_SCROLL_END: 476,
  PREVIEW_CLOSE_TAP: 512,
  PREVIEW_CLOSE: 516,
  APPROVE_PRESS: 544,
  APPROVE_PENDING: 548,
  APPROVE_DONE: 566,
  SUCCESS_BUBBLE: 572,
  OUTRO: 632,
  OUTRO_LOGO: 650,
  OUTRO_SLOGAN: 672,
} as const;

type EasingFn = (t: number) => number;

/** Reserved for impacts — a tap, a press. Fast out of the gate, long settle. */
const SNAP: EasingFn = Easing.bezier(0.16, 1, 0.3, 1);
/**
 * The default for camera moves: leaves gently, arrives gently. Eased on both
 * ends, so a push reads as flow rather than as speed.
 */
const GLIDE: EasingFn = Easing.bezier(0.42, 0, 0.18, 1);
/** Gentle correction between two holds. */
const SOFT: EasingFn = Easing.bezier(0.4, 0, 0.25, 1);
/** A hold that is not quite still — keeps the shot breathing. */
const CREEP: EasingFn = Easing.linear;

/**
 * A camera key aims at a point on the phone *screen* (in the 393x852 point
 * space the UI is authored in), not at an absolute canvas coordinate — so the
 * same key means the same shot at any composition size. `e` is the easing used
 * to arrive at that key.
 */
type CamKey = { f: number; s: number; p: number; e?: EasingFn };

/**
 * 16:9. Alternating moves and holds: every push is eased on both ends so it
 * flows, then the shot sits still while something happens on screen.
 */
const CAM_WIDE: CamKey[] = [
  { f: 0, s: 1.0, p: 425 }, //                 wide, the whole device
  { f: 44, s: 1.05, p: 437, e: CREEP }, //     barely moving — let it breathe
  { f: 68, s: 1.17, p: 569, e: GLIDE }, //     ease down to the suggestions
  { f: 92, s: 1.18, p: 573, e: CREEP }, //     hold: read the suggestions
  { f: 118, s: 1.46, p: 475, e: GLIDE }, //    ride the keyboard up
  { f: 184, s: 1.48, p: 479, e: CREEP }, //    hold: the message is typed
  { f: 194, s: 1.42, p: 514, e: SNAP }, //     kick back on send — an impact
  { f: 228, s: 2.28, p: 787, e: GLIDE }, //    long push in on the thinking bubble:
  { f: 282, s: 2.32, p: 783, e: CREEP }, //    crops the empty half of the thread
  { f: 310, s: 1.72, p: 682, e: GLIDE }, //    pull back — the answer lands
  { f: 332, s: 1.76, p: 646, e: CREEP }, //    the draft builds
  { f: 358, s: 2.06, p: 592, e: GLIDE }, //    in on the invoice
  { f: 378, s: 2.07, p: 595, e: CREEP }, //    hold: read the totals

  // The preview. One move in, one long rest, one slow drift — no second punch.
  { f: 396, s: 1.68, p: 353, e: GLIDE }, //    ride the sheet up onto the page
  { f: 414, s: 1.69, p: 356, e: CREEP }, //    hold: it is a real invoice
  { f: 438, s: 4.15, p: 258, e: GLIDE }, //    glide in: letterhead down to the table
  { f: 456, s: 4.17, p: 260, e: CREEP }, //    arrive on Yılmaz İnşaat, and stop
  { f: 486, s: 4.38, p: 330, e: CREEP }, //    then drift, slowly, down the page
  { f: 496, s: 4.36, p: 329, e: CREEP }, //    rest on Ödenecek Tutar
  { f: 510, s: 1.58, p: 360, e: GLIDE }, //    back out to the dismiss control

  // After the sheet, the screen is doing the acting: the button presses, the
  // badge flips, the bubble arrives. One move back onto the card, then the
  // camera mostly gets out of the way.
  { f: 534, s: 2.0, p: 587, e: GLIDE }, //     the sheet drops, we land on the card
  { f: 544, s: 2.01, p: 590, e: CREEP }, //    hold — the tap happens in frame
  { f: 552, s: 2.06, p: 601, e: SNAP }, //     the smallest nod on the approve
  { f: 570, s: 2.01, p: 592, e: SOFT }, //     back to rest
  { f: 630, s: 1.96, p: 607, e: CREEP }, //    one slow drift through the confirmation
];

/**
 * 9:16. Not the wide cut rescaled — a different set of framings.
 *
 * A tall frame changes what a push can do: the screen fills the width at about
 * s 3.2, and past that the bezels and then the content itself leave frame
 * sideways. So the vertical cut lives in a much narrower scale band (1.8–3.3),
 * holds the whole screen most of the time, and lets the content carry the beats
 * instead of the lens. The tight crops that 16:9 needs to hide dead space are
 * unnecessary here — there is no dead space to hide.
 */
const CAM_TALL: CamKey[] = [
  { f: 0, s: 1.76, p: 425 }, //                the device fills the tall frame
  { f: 44, s: 1.82, p: 437, e: CREEP }, //     barely moving — let it breathe
  { f: 68, s: 2.26, p: 520, e: GLIDE }, //     ease in toward the suggestions
  { f: 92, s: 2.28, p: 524, e: CREEP }, //     hold: read the suggestions
  { f: 118, s: 2.8, p: 520, e: GLIDE }, //     ride the keyboard up
  { f: 184, s: 2.82, p: 524, e: CREEP }, //    hold: the message is typed
  { f: 194, s: 2.7, p: 548, e: SNAP }, //      kick back on send — an impact
  { f: 228, s: 3.18, p: 610, e: GLIDE }, //    the thread is bottom-anchored: sit low,
  { f: 282, s: 3.2, p: 606, e: CREEP }, //     crop the empty top, ground on the device
  { f: 310, s: 2.78, p: 566, e: GLIDE }, //    open up — the answer lands
  { f: 332, s: 2.8, p: 556, e: CREEP }, //     the draft builds
  { f: 358, s: 3.14, p: 596, e: GLIDE }, //    in on the invoice card
  { f: 378, s: 3.15, p: 598, e: CREEP }, //    hold: read the totals

  // The page fills the frame width, so its type is already larger here than in
  // the wide cut's tightest close-up. Going in further would crop the document
  // sideways, so this beat is a hold and a drift, not a dive.
  { f: 396, s: 2.96, p: 385, e: GLIDE }, //    the sheet rises, the page fills it
  { f: 414, s: 2.97, p: 387, e: CREEP }, //    hold: it is a real invoice
  { f: 438, s: 3.16, p: 357, e: GLIDE }, //    ease in, the alıcı block centred
  { f: 456, s: 3.17, p: 358, e: CREEP }, //    arrive on Yılmaz İnşaat, and stop
  { f: 486, s: 3.24, p: 372, e: CREEP }, //    then drift, slowly, down the page
  { f: 496, s: 3.23, p: 371, e: CREEP }, //    rest on Ödenecek Tutar
  { f: 510, s: 2.66, p: 340, e: GLIDE }, //    back out to the dismiss control

  { f: 534, s: 3.12, p: 598, e: GLIDE }, //    the sheet drops, we land on the card
  { f: 544, s: 3.13, p: 600, e: CREEP }, //    hold — the tap happens in frame
  { f: 552, s: 3.2, p: 610, e: SNAP }, //      the smallest nod on the approve
  { f: 570, s: 3.13, p: 602, e: SOFT }, //     back to rest
  { f: 630, s: 3.08, p: 616, e: CREEP }, //    one slow drift through the confirmation
];

/** Keyframe track with per-segment easing. */
const track = (frame: number, keys: CamKey[], pick: (k: CamKey) => number) => {
  if (frame <= keys[0].f) return pick(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame <= b.f) {
      return interpolate(frame, [a.f, b.f], [pick(a), pick(b)], {
        easing: b.e ?? SOFT,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }
  return pick(keys[keys.length - 1]);
};

export const getCamera = (
  frame: number,
  width = 1920,
  height = 1080,
): Camera => {
  const { cx, cy } = phoneCenter(width, height);
  const screenTop = cy - PHONE_H / 2 + PHONE_BORDER;
  const keys = width >= height ? CAM_WIDE : CAM_TALL;
  return {
    // Nothing on the stage is ever perfectly locked.
    x: cx + Math.sin(frame / 57) * 2.5,
    y:
      screenTop +
      track(frame, keys, (k) => k.p) * SCREEN_SCALE +
      Math.cos(frame / 83) * 2,
    scale: track(frame, keys, (k) => k.s),
  };
};

/**
 * Typing is not metronomic: three bursts with a beat of hesitation between
 * them, which is what a person composing a sentence actually looks like.
 */
export const typingProgress = (frame: number) => {
  const d = T.TYPE_END - T.TYPE_START;
  return interpolate(
    frame,
    [
      T.TYPE_START,
      T.TYPE_START + d * 0.24,
      T.TYPE_START + d * 0.32,
      T.TYPE_START + d * 0.6,
      T.TYPE_START + d * 0.68,
      T.TYPE_END,
    ],
    [0, 0.27, 0.27, 0.65, 0.65, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
};
