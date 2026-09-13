/**
 * Design tokens mirrored 1:1 from the finla app so the phone screen in the
 * video is indistinguishable from the real product.
 *
 * Sources: constants/theme.ts, components/chat/chat-screen.tsx,
 * components/chat/chat-message-bubble.tsx, components/chat-input.tsx.
 * The chat screen uses a few blue-grays that are NOT in theme.ts — they are
 * kept here under the same names the app uses them for.
 */
export { FONT } from "../shared/brand";

export const C = {
  // surfaces
  white: "#FFFFFF",
  ink: "#000000",
  text: "#111111",
  muted: "#666666",
  pendingText: "#B0B0B0",
  faint: "#ABABAB",
  spinner: "#888888",
  // chat-specific blue-grays (chat-screen.tsx)
  bubbleSurface: "#F3F4F9",
  agentBubbleSurface: "#F3F4FB",
  hairline: "#E4E5EC",
  chipBorder: "#D9D9D9",
  promptIconBg: "#F2F4FD",
  promptText: "#1A1A2E",
  tableBorder: "#DDE0EA",
  // status
  success: "#22C55E",
  successInk: "#15803D",
  successBg: "rgba(34,197,94,0.12)",
  warnInk: "#B45309",
  warnBg: "rgba(245,158,11,0.14)",
  // keyboard (iOS light)
  kbBg: "#D1D4DB",
  kbKey: "#FFFFFF",
  kbKeyAlt: "#ADB3BD",
} as const;

/** iPhone 15 Pro logical points — the screen is authored at this size, then scaled. */
export const SCREEN_W = 393;
export const SCREEN_H = 852;

/** Device frame geometry, from finla-web-ds/src/PhoneMockup.tsx ratios. */
export const PHONE_W = 360;
export const PHONE_H = PHONE_W * 2.08;
export const PHONE_BORDER = PHONE_W * 0.036;
export const PHONE_RADIUS = PHONE_W * 0.14;
export const INNER_W = PHONE_W - PHONE_BORDER * 2;
export const INNER_H = PHONE_H - PHONE_BORDER * 2;
/** Factor that maps screen points to canvas pixels at camera scale 1. */
export const SCREEN_SCALE = INNER_W / SCREEN_W;

/** Where the phone sits on the 1920x1080 stage. */
export const PHONE_CX = 960;
export const PHONE_CY = 470;
export const SCREEN_TOP = PHONE_CY - PHONE_H / 2 + PHONE_BORDER;

export const KEYBOARD_H = 266;
