import React from "react";
import { Img, staticFile } from "remotion";
import { SCREEN_H, SCREEN_W } from "../../intro/tokens";
import { Spinner } from "../../intro/screen/icons";

export const Splash: React.FC<{ frame: number }> = ({ frame }) => (
  <div
    style={{
      width: SCREEN_W,
      height: SCREEN_H,
      backgroundColor: "#000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    }}
  >
    <Img
      src={staticFile("splash-icon.png")}
      style={{ width: 220, height: 220 * (395 / 814) }}
    />
    <div style={{ position: "absolute", bottom: 96 }}>
      <Spinner frame={frame} size={18} color="rgba(255,255,255,0.6)" />
    </div>
    <div
      style={{
        position: "absolute",
        bottom: 12,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 134,
          height: 5,
          borderRadius: 99,
          backgroundColor: "rgba(255,255,255,0.35)",
        }}
      />
    </div>
  </div>
);
