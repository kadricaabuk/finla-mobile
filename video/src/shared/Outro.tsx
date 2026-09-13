import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND, FONT, WORDMARK } from "./brand";
import { easeRamp } from "./anim";

/**
 * How long the end card takes to dissolve in. Every mount gets this for free —
 * pass `fadeIn={0}` for a hard cut. Exported so a composition can hold its last
 * shot alive underneath for exactly this long.
 */
export const OUTRO_FADE = 14;

export type OutroProps = {
  /** The tagline. Omit it to end on the wordmark alone, still centered. */
  slogan?: string;
  /** Overrides the wordmark, for co-branded cuts. */
  wordmark?: string;
  /**
   * Frame relative to the outro's own first frame. Leave it out when the outro
   * is mounted inside a <Sequence> — useCurrentFrame() is already relative.
   */
  frame?: number;
  fps?: number;
  /** Beats, relative to the outro's own start. */
  logoAt?: number;
  sloganAt?: number;
  background?: string;
  /** Frames the card takes to dissolve in over whatever is behind it. */
  fadeIn?: number;
  /** Type sizes default to the canvas; pass them to art-direct a specific cut. */
  logoSize?: number;
  sloganSize?: number;
};

/**
 * The finla end card, shared by every composition: two beats on black — the
 * wordmark lands alone, dead center, then lifts just enough to seat the tagline
 * beneath it, so the pair ends up centered too.
 *
 * Sizes are derived from the canvas's shorter side, so the same component holds
 * up at 16:9, 9:16 and 1:1 without art-direction.
 */
export const Outro: React.FC<OutroProps> = ({
  slogan,
  wordmark = WORDMARK,
  frame: frameProp,
  fps: fpsProp,
  logoAt = 7,
  sloganAt = 29,
  background = BRAND.black,
  fadeIn = OUTRO_FADE,
  logoSize,
  sloganSize,
}) => {
  const currentFrame = useCurrentFrame();
  const { fps: configFps, width, height } = useVideoConfig();
  const frame = frameProp ?? currentFrame;
  const fps = fpsProp ?? configFps;

  // 156 / 46 / 92 at 1080, which is what the 16:9 intro was cut at.
  const base = Math.min(width, height);
  const logo = logoSize ?? base * 0.1444;
  const tagline = sloganSize ?? base * 0.0426;
  const sloganBlock = base * 0.0852; // tagline height + the gap above it

  const logoPop = spring({
    frame: frame - logoAt,
    fps,
    config: { damping: 200, stiffness: 85, mass: 0.9 },
  });
  const logoIn = easeRamp(frame, logoAt, logoAt + 16);

  // The lift happens slightly before the tagline fades in, so the two moves read
  // as one gesture rather than a jump.
  const hasSlogan = Boolean(slogan);
  const lift = hasSlogan
    ? spring({
        frame: frame - (sloganAt - 6),
        fps,
        config: { damping: 200, stiffness: 70, mass: 1 },
      })
    : 0;
  const sloganIn = hasSlogan ? easeRamp(frame, sloganAt, sloganAt + 18) : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeIn > 0 ? easeRamp(frame, 0, fadeIn) : 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          fontFamily: FONT,
          fontSize: logo,
          fontWeight: 700,
          letterSpacing: "-0.0417em",
          lineHeight: `${logo}px`,
          color: BRAND.white,
          opacity: logoIn,
          transform: `translateY(${-lift * (sloganBlock / 2)}px) scale(${0.955 + logoPop * 0.045})`,
        }}
      >
        {wordmark}
      </div>
      {hasSlogan ? (
        <div
          style={{
            position: "absolute",
            fontFamily: FONT,
            fontSize: tagline,
            fontWeight: 400,
            letterSpacing: "0.0087em",
            lineHeight: `${tagline}px`,
            color: BRAND.onBlackMuted,
            transform: `translateY(${sloganBlock + (1 - sloganIn) * (base * 0.013)}px)`,
            opacity: sloganIn,
          }}
        >
          {slogan}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
