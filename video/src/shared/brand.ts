/**
 * Brand-level constants shared by every composition in this project.
 * Composition-specific tokens (the chat palette, the phone geometry) live next
 * to the composition that uses them — see src/intro/tokens.ts.
 */
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
  ignoreTooManyRequestsWarning: true,
});

/** Inter first so renders are identical on every machine; SF Pro is what ships on device. */
export const FONT = `${fontFamily}, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Helvetica, sans-serif`;

/** The wordmark, as it is always set: lowercase, heavy, tightly tracked. */
export const WORDMARK = "finla";

export const BRAND = {
  black: "#000000",
  white: "#FFFFFF",
  /** The tagline never sits at full white — it reads as secondary to the wordmark. */
  onBlackMuted: "rgba(255,255,255,0.82)",
} as const;
