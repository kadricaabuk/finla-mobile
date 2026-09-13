import { Easing, interpolate } from "remotion";
import { PHONE_BORDER, PHONE_H, SCREEN_SCALE } from "../intro/tokens";
import { phoneCenter, type Camera } from "../shared/camera";

export type { Camera };

export const FPS = 30;
export const DURATION = 670; // 22.3 s

export const T = {
  NOTIF_IN: 48,
  NOTIF_OUT: 128,
  ICON_PRESS: 168,
  APP_OPEN: 178,
  SPLASH_FULL: 196,
  CHAT: 226,
  THINK_START: 234,
  THINK_STEP_2: 258,
  THINK_STEP_3: 282,
  ASSIST_START: 310,
  CARD_IN: 326,
  ASSIST_END: 370,
  CARD_TAP: 396,
  SHEET_OPEN: 400,
  SHEET_SCROLL_START: 418,
  SHEET_SCROLL_END: 454,
  APPROVE_PRESS: 464,
  APPROVE_PENDING: 468,
  APPROVE_DONE: 486,
  SHEET_CLOSE: 492,
  SUCCESS: 510,
  OUTRO: 548,
  OUTRO_LOGO: 566,
  OUTRO_SLOGAN: 588,
} as const;

/**
 * finla icon on the homescreen screenshot, in 393×852 points.
 * Origin is top-left of the icon squircle.
 */
export const FINLA_ICON = { left: 210, top: 456, size: 60 } as const;

type EasingFn = (t: number) => number;
/** Slow into the move, long settle — no overshoot. */
const GLIDE: EasingFn = Easing.bezier(0.45, 0.02, 0.18, 1);
const HOLD: EasingFn = Easing.linear;

/**
 * `p` is a point on the phone screen (393×852), not a canvas coordinate — so
 * the same key is the same shot at 16:9 and 9:16.
 */
type CamKey = { f: number; s: number; p: number; e?: EasingFn };

/** 16:9. Same framings as before, expressed in screen points. */
const CAM_WIDE: CamKey[] = [
  { f: 0, s: 1.0, p: 425 },
  { f: 40, s: 1.04, p: 416, e: HOLD },
  { f: 108, s: 1.42, p: 216, e: GLIDE },
  { f: 124, s: 1.44, p: 218, e: HOLD },
  { f: 168, s: 1.68, p: 486, e: GLIDE },
  { f: 178, s: 1.7, p: 489, e: HOLD },
  { f: 196, s: 1.48, p: 425, e: GLIDE },
  { f: 226, s: 1.46, p: 461, e: HOLD },
  { f: 260, s: 1.42, p: 578, e: GLIDE },
  { f: 310, s: 1.44, p: 583, e: HOLD },
  { f: 360, s: 1.5, p: 602, e: GLIDE },
  { f: 396, s: 1.52, p: 604, e: HOLD },
  { f: 430, s: 1.4, p: 425, e: GLIDE },
  { f: 492, s: 1.4, p: 425, e: HOLD },
  { f: 512, s: 1.48, p: 578, e: GLIDE },
  { f: 548, s: 1.46, p: 566, e: HOLD },
];

/**
 * 9:16. Not the wide cut rescaled. The screen fills the width around s 3.0;
 * past that the bezels leave frame sideways. Stay in 1.8–2.95, hold the whole
 * device most of the time, punch only for the banner / icon / thread.
 */
const CAM_TALL: CamKey[] = [
  { f: 0, s: 1.82, p: 425 },
  { f: 40, s: 1.88, p: 416, e: HOLD },
  { f: 108, s: 2.48, p: 118, e: GLIDE },
  { f: 124, s: 2.5, p: 120, e: HOLD },
  { f: 168, s: 2.62, p: 486, e: GLIDE },
  { f: 178, s: 2.64, p: 489, e: HOLD },
  { f: 196, s: 2.28, p: 425, e: GLIDE },
  { f: 226, s: 2.26, p: 450, e: HOLD },
  { f: 260, s: 2.72, p: 640, e: GLIDE },
  { f: 310, s: 2.74, p: 644, e: HOLD },
  { f: 360, s: 2.82, p: 620, e: GLIDE },
  { f: 396, s: 2.84, p: 622, e: HOLD },
  { f: 430, s: 2.36, p: 425, e: GLIDE },
  { f: 492, s: 2.36, p: 425, e: HOLD },
  { f: 512, s: 2.7, p: 640, e: GLIDE },
  { f: 548, s: 2.66, p: 630, e: HOLD },
];

const track = (frame: number, keys: CamKey[], pick: (k: CamKey) => number) => {
  if (frame <= keys[0].f) return pick(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame <= b.f) {
      return interpolate(frame, [a.f, b.f], [pick(a), pick(b)], {
        easing: b.e ?? GLIDE,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }
  return pick(keys[keys.length - 1]);
};

export const getCamera = (
  frame: number,
  width: number,
  height: number,
): Camera => {
  const { cx, cy } = phoneCenter(width, height);
  const screenTop = cy - PHONE_H / 2 + PHONE_BORDER;
  const keys = width >= height ? CAM_WIDE : CAM_TALL;
  return {
    x: cx + Math.sin(frame / 57) * 2.5,
    y:
      screenTop +
      track(frame, keys, (k) => k.p) * SCREEN_SCALE +
      Math.cos(frame / 83) * 2,
    scale: track(frame, keys, (k) => k.s),
  };
};

/** Linear type with a short pause after the first sentence. */
export const assistTyping = (frame: number) => {
  const a = T.ASSIST_START;
  const b = T.ASSIST_END;
  return interpolate(
    frame,
    [a, a + (b - a) * 0.5, a + (b - a) * 0.56, b],
    [0, 0.58, 0.58, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
};
