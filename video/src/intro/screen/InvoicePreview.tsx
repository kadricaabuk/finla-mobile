import React from "react";
import { Img, spring, staticFile } from "remotion";
import { C, FONT, SCREEN_H, SCREEN_W } from "../tokens";
import { T } from "../timeline";
import { easeRamp } from "../../shared/anim";
import type { IntroContent } from "../content";
import { EArsivDocument } from "./EArsivDocument";
import { CloseIcon, ShareIcon, StatusBarIcons } from "./icons";

type Props = { frame: number; fps: number; content: IntroContent };

/**
 * The sheet "Taslağı Gör" opens, with the same chrome as the app's
 * components/chat/invoice-preview-modal.tsx — title, share, close, hairline
 * header — wrapping the invoice itself.
 *
 * The page inside is a real e-Arsiv draft exported from the app, shown the way
 * the WebView shows it: fitted to the screen width, the whole page at once.
 * Flip the flag below to fall back to `EArsivDocument`, the same template
 * redrawn at screen scale, which stays legible at wider framings and keeps
 * every figure bound to the schema.
 */
const USE_EXPORTED_PAGE: boolean = true;

/** 612x792pt page, fitted to the screen width. */
const PAGE_H = SCREEN_W * (792 / 612);

export const InvoicePreview: React.FC<Props> = ({ frame, fps, content }) => {
  const up = spring({
    frame: frame - T.PREVIEW_OPEN,
    fps,
    config: { damping: 30, stiffness: 115, mass: 0.9 },
  });
  const down = spring({
    frame: frame - T.PREVIEW_CLOSE,
    fps,
    config: { damping: 30, stiffness: 125, mass: 0.8 },
  });
  const open = Math.max(0, Math.min(1, up - down));
  if (open < 0.002) return null;

  // The exported page fits the viewport, so there is nothing to scroll; the
  // redrawn one is taller and rides up the way the WebView does on device.
  const scroll = USE_EXPORTED_PAGE
    ? 0
    : easeRamp(frame, T.PREVIEW_SCROLL_START, T.PREVIEW_SCROLL_END) * 38;
  const closePressed =
    frame >= T.PREVIEW_CLOSE_TAP && frame < T.PREVIEW_CLOSE_TAP + 5;

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
        overflow: "hidden",
        transform: `translateY(${(1 - open) * SCREEN_H}px)`,
        boxShadow: "0 -10px 34px rgba(0,0,0,0.22)",
      }}
    >
      {/* status bar — a fullscreen Modal still sits under it */}
      <div
        style={{
          height: 54,
          paddingLeft: 32,
          paddingRight: 26,
          paddingTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: FONT,
            fontSize: 16,
            fontWeight: 600,
            color: C.ink,
          }}
        >
          {content.clock}
        </span>
        <StatusBarIcons />
      </div>

      {/* sheet header */}
      <div
        style={{
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #DCDCDC",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: FONT,
            fontSize: 17,
            fontWeight: 600,
            color: C.ink,
          }}
        >
          Fatura Önizleme
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={iconBtn}>
            <ShareIcon />
          </div>
          <div
            style={{
              ...iconBtn,
              backgroundColor: closePressed ? "#EEEEEE" : "transparent",
              borderRadius: 999,
              transform: `scale(${closePressed ? 0.9 : 1})`,
            }}
          >
            <CloseIcon />
          </div>
        </div>
      </div>

      {/* the invoice */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: SCREEN_W,
            padding: USE_EXPORTED_PAGE ? 0 : 16,
            boxSizing: "border-box",
            transform: `translateY(${-scroll}px)`,
          }}
        >
          {USE_EXPORTED_PAGE ? (
            <Img
              src={staticFile("inbox-invoice.png")}
              style={{ display: "block", width: SCREEN_W, height: PAGE_H }}
            />
          ) : (
            <EArsivDocument content={content} />
          )}
        </div>
      </div>
    </div>
  );
};

const iconBtn: React.CSSProperties = {
  width: 44,
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
