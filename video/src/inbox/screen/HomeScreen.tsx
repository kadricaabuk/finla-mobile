import React from "react";
import { Img, staticFile } from "remotion";
import { SCREEN_H, SCREEN_W } from "../../intro/tokens";

/**
 * Real device screenshot, letterboxed into the 393×852 authoring frame.
 * Status bar and icons are in the image — do not paint a second chrome.
 */
export const HomeScreen: React.FC = () => (
  <div
    style={{
      width: SCREEN_W,
      height: SCREEN_H,
      backgroundColor: "#000",
      position: "relative",
      overflow: "hidden",
    }}
  >
    <Img
      src={staticFile("homescreen.png")}
      style={{
        width: SCREEN_W,
        height: SCREEN_H,
        objectFit: "cover",
        objectPosition: "center top",
      }}
    />
  </div>
);
