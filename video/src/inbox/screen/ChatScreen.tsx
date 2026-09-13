import React from "react";
import { spring } from "remotion";
import { FONT } from "../../shared/brand";
import { C, SCREEN_H, SCREEN_W } from "../../intro/tokens";
import { CheckIcon, MenuIcon, Spinner, StatusBarIcons } from "../../intro/screen/icons";
import { easeRamp } from "../../shared/anim";
import { T, assistTyping } from "../timeline";
import { THINKING_STEPS, type InboxContent } from "../content";
import { IncomingCard } from "./IncomingCard";
import { IncomingSheet } from "./IncomingSheet";

const bubbleBase: React.CSSProperties = {
  paddingLeft: 14,
  paddingRight: 14,
  paddingTop: 10,
  paddingBottom: 10,
  borderRadius: 20,
  fontFamily: FONT,
  fontSize: 15,
  lineHeight: "22px",
};

const Enter: React.FC<{
  frame: number;
  fps: number;
  at: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ frame, fps, at, children, style }) => {
  const p = spring({
    frame: frame - at,
    fps,
    config: { damping: 26, stiffness: 110, mass: 0.75 },
  });
  return (
    <div
      style={{
        ...style,
        opacity: Math.min(1, p * 1.4),
        transform: `translateY(${(1 - p) * 8}px)`,
      }}
    >
      {children}
    </div>
  );
};

export const ChatScreen: React.FC<{
  frame: number;
  fps: number;
  content: InboxContent;
}> = ({ frame, fps, content }) => {
  const thinking = frame >= T.THINK_START && frame < T.ASSIST_START;
  const stepIndex =
    frame >= T.THINK_STEP_3 ? 2 : frame >= T.THINK_STEP_2 ? 1 : 0;
  const stepStart = [T.THINK_START, T.THINK_STEP_2, T.THINK_STEP_3][stepIndex];
  const chars = Math.floor(assistTyping(frame) * content.assistantText.length);
  const cardIn = easeRamp(frame, T.CARD_IN, T.CARD_IN + 16);
  const cardPressed = frame >= T.CARD_TAP && frame < T.SHEET_OPEN + 6;
  const accepted = frame >= T.APPROVE_DONE;
  const showSuccess = frame >= T.SUCCESS;

  return (
    <div
      style={{
        width: SCREEN_W,
        height: SCREEN_H,
        backgroundColor: C.white,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          paddingTop: 14,
          paddingLeft: 28,
          paddingRight: 22,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>
          {content.clock}
        </span>
        <StatusBarIcons />
      </div>
      <div
        style={{
          height: 52,
          paddingLeft: 16,
          paddingRight: 16,
          display: "flex",
          alignItems: "center",
          borderBottom: `0.5px solid ${C.hairline}`,
          gap: 12,
        }}
      >
        <MenuIcon />
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: -0.8,
            color: C.ink,
          }}
        >
          finla
        </span>
      </div>

      <div
        style={{
          flex: 1,
          padding: "16px 16px 8px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 12,
          overflow: "hidden",
        }}
      >
        {thinking ? (
          <Enter
            frame={frame}
            fps={fps}
            at={T.THINK_START}
            style={{ alignSelf: "flex-start" }}
          >
            <div
              style={{
                ...bubbleBase,
                backgroundColor: C.agentBubbleSurface,
                border: "1px solid #E4E5ED",
                borderBottomLeftRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Spinner frame={frame} size={17} />
              <span
                style={{
                  color: C.pendingText,
                  opacity:
                    0.55 + easeRamp(frame, stepStart, stepStart + 10) * 0.45,
                  transform: `translateY(${(1 - easeRamp(frame, stepStart, stepStart + 10)) * 3}px)`,
                }}
              >
                {THINKING_STEPS[stepIndex]}
              </span>
            </div>
          </Enter>
        ) : null}

        {frame >= T.ASSIST_START && chars > 0 ? (
          <Enter
            frame={frame}
            fps={fps}
            at={T.ASSIST_START}
            style={{ alignSelf: "flex-start", maxWidth: "88%" }}
          >
            <div
              style={{
                ...bubbleBase,
                backgroundColor: C.agentBubbleSurface,
                border: "1px solid #E4E5ED",
                color: C.ink,
                borderBottomLeftRadius: 6,
              }}
            >
              {content.assistantText.slice(0, chars)}
            </div>
          </Enter>
        ) : null}

        {cardIn > 0.01 ? (
          <div
            style={{
              opacity: cardIn,
              transform: `translateY(${(1 - cardIn) * 10}px)`,
            }}
          >
            <IncomingCard
              content={content}
              pressed={cardPressed}
              accepted={accepted}
            />
          </div>
        ) : null}

        {showSuccess ? (
          <Enter
            frame={frame}
            fps={fps}
            at={T.SUCCESS}
            style={{ alignSelf: "flex-start", maxWidth: "88%" }}
          >
            <div
              style={{
                ...bubbleBase,
                backgroundColor: C.bubbleSurface,
                color: C.ink,
                borderBottomLeftRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 19,
                  height: 19,
                  borderRadius: 999,
                  backgroundColor: C.success,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <CheckIcon size={12} />
              </div>
              <span style={{ fontWeight: 600 }}>{content.successText}</span>
            </div>
          </Enter>
        ) : null}
      </div>

      <div
        style={{
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 8,
          paddingBottom: 10,
        }}
      >
        <div
          style={{
            height: 44,
            backgroundColor: C.bubbleSurface,
            borderRadius: 22,
            paddingLeft: 16,
            display: "flex",
            alignItems: "center",
            fontSize: 16,
            color: C.faint,
          }}
        >
          finla&apos;ya yaz
        </div>
      </div>
      <div
        style={{
          height: 26,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 134,
            height: 5,
            borderRadius: 99,
            backgroundColor: C.ink,
          }}
        />
      </div>

      <IncomingSheet frame={frame} fps={fps} content={content} />
    </div>
  );
};
