import React from "react";
import { Easing, interpolate } from "remotion";
import { SCREEN_H, SCREEN_W } from "../../intro/tokens";
import { FINLA_ICON, T } from "../timeline";

/** Black squircle grows from the home-screen icon. Logo is not in this layer. */
export const AppOpen: React.FC<{ frame: number }> = ({ frame }) => {
  const press = interpolate(frame, [T.ICON_PRESS, T.APP_OPEN], [1, 0.88], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  });
  const p = interpolate(frame, [T.APP_OPEN, T.SPLASH_FULL], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 0.82, 0.2, 1),
  });

  const size0 = FINLA_ICON.size * (frame < T.APP_OPEN ? press : 1);
  const cx = FINLA_ICON.left + FINLA_ICON.size / 2;
  const cy = FINLA_ICON.top + FINLA_ICON.size / 2;

  return (
    <div
      style={{
        position: "absolute",
        left: interpolate(p, [0, 1], [cx - size0 / 2, 0]),
        top: interpolate(p, [0, 1], [cy - size0 / 2, 0]),
        width: interpolate(p, [0, 1], [size0, SCREEN_W]),
        height: interpolate(p, [0, 1], [size0, SCREEN_H]),
        borderRadius: interpolate(p, [0, 1], [14, 0]),
        backgroundColor: "#000",
      }}
    />
  );
};
