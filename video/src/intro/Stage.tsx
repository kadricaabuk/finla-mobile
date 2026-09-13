import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { cameraTransform, phoneCenter, type Camera } from "../shared/camera";
import { PHONE_H } from "./tokens";

/**
 * The studio backdrop: a softly lit gray cyclorama with a dark round pedestal,
 * recreated in CSS. The backdrop sits on a shallower parallax plane than the
 * pedestal so the push-in gains depth.
 */
export const Stage: React.FC<{ cam: Camera; frame: number }> = ({
  cam,
  frame,
}) => {
  const { width, height } = useVideoConfig();
  const { cx, cy } = phoneCenter(width, height);
  const pedestalTop = cy + PHONE_H / 2 + 4;

  return (
    <AbsoluteFill style={{ backgroundColor: "#8E9095", overflow: "hidden" }}>
      {/* far backdrop — moves least */}
      <AbsoluteFill
        style={{
          transform: cameraTransform(cam, 0.28, width, height),
          background:
            "radial-gradient(120% 90% at 50% 32%, #E2E3E6 0%, #C4C6CB 38%, #9B9DA2 70%, #75777C 100%)",
          filter: "blur(5px)",
        }}
      >
        {/* key light spill from the upper left */}
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(45% 40% at 26% 18%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 70%)",
          }}
        />
      </AbsoluteFill>

      {/* pedestal + contact shadow — share the phone's plane so they stay attached */}
      <AbsoluteFill
        style={{
          transform: cameraTransform(cam, 1, width, height),
          transformOrigin: "0 0",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: cx - 650,
            top: pedestalTop - 76,
            width: 1300,
            height: 420,
            borderRadius: "50% 50% 0 0 / 118px 118px 0 0",
            background:
              "linear-gradient(180deg, #2A2B30 0%, #191A1D 22%, #0D0E10 62%, #08090A 100%)",
            boxShadow: "0 -1px 0 rgba(255,255,255,0.07) inset",
          }}
        />
        {/* sheen across the pedestal top surface */}
        <div
          style={{
            position: "absolute",
            left: cx - 630,
            top: pedestalTop - 68,
            width: 1260,
            height: 170,
            borderRadius: "50%",
            background:
              "radial-gradient(60% 70% at 40% 35%, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0) 72%)",
          }}
        />
        {/* contact shadow under the device */}
        <div
          style={{
            position: "absolute",
            left: cx - 210,
            top: pedestalTop - 34,
            width: 420,
            height: 72,
            borderRadius: "50%",
            background:
              "radial-gradient(closest-side, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0) 100%)",
            filter: "blur(11px)",
          }}
        />
      </AbsoluteFill>

      {/* vignette + grain, locked to the frame */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(68% 70% at 50% 42%, rgba(0,0,0,0) 34%, rgba(0,0,0,0.30) 70%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {/* film grain, rendered inline so it is guaranteed present at capture time */}
      <AbsoluteFill style={{ opacity: 0.05, mixBlendMode: "overlay" }}>
        <svg width="100%" height="100%">
          <filter id="grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.82"
              numOctaves={3}
              seed={frame % 12}
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
