import React from "react";
import { useVideoConfig } from "remotion";
import { phoneCenter } from "../shared/camera";
import {
  INNER_H,
  INNER_W,
  PHONE_BORDER,
  PHONE_H,
  PHONE_RADIUS,
  PHONE_W,
  SCREEN_H,
  SCREEN_SCALE,
  SCREEN_W,
} from "./tokens";

/**
 * Device frame using the same ratios as finla-web-ds/src/PhoneMockup.tsx.
 * Children are authored at iPhone point size and scaled into the cutout.
 */
export const Phone: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width, height } = useVideoConfig();
  const { cx, cy } = phoneCenter(width, height);
  return (
  <div
    style={{
      position: "absolute",
      left: cx - PHONE_W / 2,
      top: cy - PHONE_H / 2,
      width: PHONE_W,
      height: PHONE_H,
      borderRadius: PHONE_RADIUS,
      background: "linear-gradient(160deg, #3A3C40 0%, #17181A 22%, #0E0F11 60%, #26282C 100%)",
      padding: PHONE_BORDER,
      boxSizing: "border-box",
      boxShadow:
        "0 26px 64px rgba(0,0,0,0.46), 0 10px 24px rgba(0,0,0,0.32), 0 1px 0 rgba(255,255,255,0.14) inset",
    }}
  >
    <div
      style={{
        position: "relative",
        width: INNER_W,
        height: INNER_H,
        borderRadius: PHONE_RADIUS - PHONE_BORDER,
        overflow: "hidden",
        backgroundColor: "#fff",
      }}
    >
      <div
        style={{
          position: "relative",
          width: SCREEN_W,
          height: SCREEN_H,
          transform: `scale(${SCREEN_SCALE})`,
          transformOrigin: "0 0",
        }}
      >
        {children}
      </div>

      {/* dynamic island */}
      <div
        style={{
          position: "absolute",
          top: 11,
          left: INNER_W / 2 - (INNER_W * 0.28) / 2,
          width: INNER_W * 0.28,
          height: INNER_W * 0.075,
          borderRadius: 999,
          backgroundColor: "#050505",
        }}
      />

      {/* glass sheen */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.03) 28%, rgba(255,255,255,0) 52%)",
          pointerEvents: "none",
        }}
      />
    </div>
  </div>
  );
};
