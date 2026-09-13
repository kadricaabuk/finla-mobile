import React from "react";
import { spring } from "remotion";
import { FONT } from "../../shared/brand";
import { C, SCREEN_H, SCREEN_W } from "../../intro/tokens";
import { CloseIcon, Spinner } from "../../intro/screen/icons";
import { easeRamp } from "../../shared/anim";
import { T } from "../timeline";
import { RedactedInvoice } from "./RedactedInvoice";
import type { InboxContent } from "../content";

export const IncomingSheet: React.FC<{
  frame: number;
  fps: number;
  content: InboxContent;
}> = ({ frame, fps, content }) => {
  const up = spring({
    frame: frame - T.SHEET_OPEN,
    fps,
    config: { damping: 30, stiffness: 115, mass: 0.9 },
  });
  const down = spring({
    frame: frame - T.SHEET_CLOSE,
    fps,
    config: { damping: 28, stiffness: 140, mass: 0.8 },
    durationInFrames: 22,
  });
  const y = (1 - up) * SCREEN_H + down * SCREEN_H;
  if (up < 0.002 || down > 0.995) return null;

  const scroll = easeRamp(
    frame,
    T.SHEET_SCROLL_START,
    T.SHEET_SCROLL_END,
  );
  const pressed =
    frame >= T.APPROVE_PRESS && frame < T.APPROVE_PENDING + 4;
  const pending =
    frame >= T.APPROVE_PENDING && frame < T.APPROVE_DONE;
  const done = frame >= T.APPROVE_DONE;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: SCREEN_W,
        height: SCREEN_H,
        backgroundColor: C.white,
        display: "flex",
        flexDirection: "column",
        transform: `translateY(${y}px)`,
        boxShadow: "0 -10px 34px rgba(0,0,0,0.22)",
      }}
    >
      <div
        style={{
          paddingTop: 48,
          paddingLeft: 16,
          paddingRight: 8,
          paddingBottom: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "0.5px solid #DCDCDC",
        }}
      >
        <div
          style={{
            flex: 1,
            marginRight: 12,
            fontFamily: FONT,
            fontSize: 17,
            fontWeight: 600,
            color: C.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {content.sellerShort}
        </div>
        <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CloseIcon size={24} />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <RedactedInvoice mode="full" width={SCREEN_W} scroll={scroll} />
      </div>

      <div
        style={{
          borderTop: "0.5px solid #E5E5E5",
          padding: "12px 16px 16px",
          backgroundColor: C.white,
          display: "flex",
          gap: 10,
        }}
      >
        <div
          style={{
            flex: 1,
            height: 48,
            borderRadius: 10,
            backgroundColor: "#EF4444",
            color: "#fff",
            fontFamily: FONT,
            fontSize: 15,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: done ? 0.45 : 1,
          }}
        >
          Reddet
        </div>
        <div
          style={{
            flex: 1,
            height: 48,
            borderRadius: 10,
            backgroundColor: done ? C.success : "#16A34A",
            color: "#fff",
            fontFamily: FONT,
            fontSize: 15,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transform: `scale(${pressed ? 0.94 : 1})`,
          }}
        >
          {pending ? (
            <Spinner frame={frame} size={18} color="#fff" />
          ) : done ? (
            "Kabul"
          ) : (
            "Onayla"
          )}
        </div>
      </div>
    </div>
  );
};
