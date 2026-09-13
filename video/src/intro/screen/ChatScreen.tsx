import React from "react";
import { interpolate, spring } from "remotion";
import {
  ASSISTANT_TEXT,
  EXAMPLE_PROMPTS,
  THINKING_STEPS,
  type IntroContent,
} from "../content";
import { T, typingProgress } from "../timeline";
import { easeRamp, ramp } from "../../shared/anim";
import { C, FONT, KEYBOARD_H, SCREEN_H, SCREEN_W } from "../tokens";
import { DraftCard } from "./DraftCard";
import {
  ArrowUpIcon,
  CheckIcon,
  MenuIcon,
  PromptIcon,
  Spinner,
  StatusBarIcons,
} from "./icons";
import { Keyboard } from "./Keyboard";
import { InvoicePreview } from "./InvoicePreview";

type Props = { frame: number; fps: number; content: IntroContent };

/** Standard entrance for anything appearing in the message list. */
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
    config: { damping: 22, stiffness: 130, mass: 0.6 },
  });
  return (
    <div
      style={{
        ...style,
        opacity: Math.min(1, p * 1.5),
        transform: `translateY(${(1 - p) * 10}px)`,
      }}
    >
      {children}
    </div>
  );
};

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

export const ChatScreen: React.FC<Props> = ({ frame, fps, content }) => {
  // --- keyboard -------------------------------------------------------------
  const kbUp = spring({
    frame: frame - T.KEYBOARD_OPEN,
    fps,
    config: { damping: 26, stiffness: 120, mass: 0.7 },
  });
  const kbDown = spring({
    frame: frame - T.KEYBOARD_CLOSE,
    fps,
    config: { damping: 26, stiffness: 110, mass: 0.8 },
  });
  const kb = Math.max(0, Math.min(1, kbUp - kbDown));

  // --- composing ------------------------------------------------------------
  const typedCount = Math.floor(
    typingProgress(frame) * content.promptText.length,
  );
  const sent = frame >= T.SEND_PRESS;
  const typed = sent ? "" : content.promptText.slice(0, typedCount);
  const caretOn = kb > 0.5 && !sent && Math.floor(frame / 16) % 2 === 0;
  const sendPressed = frame >= T.SEND_PRESS && frame < T.SEND_PRESS + 4;
  const sendVisible =
    easeRamp(frame, T.TYPE_START + 2, T.TYPE_START + 10) * (sent ? 0 : 1);

  // --- assistant ------------------------------------------------------------
  const thinking = frame >= T.THINK_START && frame < T.ASSIST_START;
  const stepIndex =
    frame >= T.THINK_STEP_3 ? 2 : frame >= T.THINK_STEP_2 ? 1 : 0;
  const stepStart = [T.THINK_START, T.THINK_STEP_2, T.THINK_STEP_3][stepIndex];
  // Streamed text lands in chunks, the way the NDJSON deltas actually arrive.
  const assistChars =
    Math.floor(
      interpolate(
        frame,
        [T.ASSIST_START, T.ASSIST_TEXT_END],
        [0, ASSISTANT_TEXT.length],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      ) / 3,
    ) * 3;

  const promptsOpacity =
    easeRamp(frame, T.PROMPTS_IN, T.PROMPTS_IN + 12) *
    (1 - ramp(frame, T.TYPE_START + 4, T.TYPE_START + 18));

  return (
    <div
      style={{
        width: SCREEN_W,
        height: SCREEN_H,
        backgroundColor: C.white,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* status bar */}
      <div
        style={{
          height: 54,
          paddingLeft: 32,
          paddingRight: 26,
          paddingTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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

      {/* header */}
      <div
        style={{
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 10,
          paddingBottom: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${C.hairline}`,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
          }}
        >
          <MenuIcon />
        </div>
        <span
          style={{
            fontFamily: FONT,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: -0.8,
            color: C.ink,
          }}
        >
          finla
        </span>
        <div style={{ width: 40, height: 40 }} />
      </div>

      {/* message list — bottom anchored, like the real FlatList */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 8,
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 12,
          paddingBottom: 12,
          overflow: "hidden",
        }}
      >
        {frame >= T.USER_BUBBLE ? (
          <Enter
            frame={frame}
            fps={fps}
            at={T.USER_BUBBLE}
            style={{ alignSelf: "flex-end", maxWidth: "84%" }}
          >
            <div
              style={{
                ...bubbleBase,
                backgroundColor: C.ink,
                color: C.white,
                borderBottomRightRadius: 6,
              }}
            >
              {content.promptText}
            </div>
          </Enter>
        ) : null}

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
                    0.58 + easeRamp(frame, stepStart, stepStart + 7) * 0.42,
                  transform: `translateY(${(1 - easeRamp(frame, stepStart, stepStart + 7)) * 4}px)`,
                }}
              >
                {THINKING_STEPS[stepIndex]}
              </span>
            </div>
          </Enter>
        ) : null}

        {frame >= T.ASSIST_START ? (
          <Enter
            frame={frame}
            fps={fps}
            at={T.ASSIST_START}
            style={{ alignSelf: "flex-start", maxWidth: "86%" }}
          >
            <div
              style={{
                ...bubbleBase,
                maxWidth: "100%",
                backgroundColor: C.agentBubbleSurface,
                border: `1px solid ${"#E4E5ED"}`,
                color: C.ink,
                borderBottomLeftRadius: 6,
              }}
            >
              {ASSISTANT_TEXT.slice(0, assistChars)}
            </div>
          </Enter>
        ) : null}

        {frame >= T.CARD_IN ? (
          <DraftCard frame={frame} fps={fps} content={content} />
        ) : null}

        {frame >= T.SUCCESS_BUBBLE ? (
          <Enter
            frame={frame}
            fps={fps}
            at={T.SUCCESS_BUBBLE}
            style={{ alignSelf: "flex-start", maxWidth: "88%" }}
          >
            <div
              style={{
                ...bubbleBase,
                maxWidth: "100%",
                backgroundColor: C.bubbleSurface,
                color: C.ink,
                borderBottomLeftRadius: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                <span style={{ fontWeight: 600 }}>
                  Fatura GİB&apos;e gönderildi.
                </span>
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  lineHeight: "17px",
                  color: C.muted,
                  letterSpacing: 0.2,
                }}
              >
                ETTN: {content.ettn}
              </div>
            </div>
          </Enter>
        ) : null}

        {/* example prompts — shown while the thread is empty and the input is focused */}
        {promptsOpacity > 0.01 ? (
          <div style={{ opacity: promptsOpacity, marginTop: 8 }}>
            {EXAMPLE_PROMPTS.map((p, i) => {
              const at = T.PROMPTS_IN + i * 4;
              const e = easeRamp(frame, at, at + 12);
              return (
                <div
                  key={p.text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    paddingTop: 10,
                    paddingBottom: 10,
                    opacity: e,
                    transform: `translateY(${(1 - e) * 10}px)`,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      backgroundColor: C.promptIconBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <PromptIcon name={p.icon} />
                  </div>
                  <span
                    style={{
                      fontFamily: FONT,
                      fontSize: 15,
                      color: C.promptText,
                    }}
                  >
                    {p.text}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* input bar */}
      <div
        style={{
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 8,
          paddingBottom: 10,
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 44,
            backgroundColor: C.bubbleSurface,
            borderRadius: 22,
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 11,
            paddingBottom: 11,
            display: "flex",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: FONT,
              fontSize: 16,
              lineHeight: "22px",
              color: typed.length > 0 ? C.ink : C.faint,
            }}
          >
            {typed.length > 0 ? typed : "finla'ya yaz"}
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: 18,
                marginLeft: 1.5,
                verticalAlign: "-3px",
                backgroundColor: C.ink,
                opacity: caretOn ? 1 : 0,
              }}
            />
          </span>
        </div>
        {sendVisible > 0.01 ? (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: C.ink,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              opacity: sendVisible,
              transform: `scale(${(0.85 + sendVisible * 0.15) * (sendPressed ? 0.86 : 1)})`,
            }}
          >
            <ArrowUpIcon />
          </div>
        ) : null}
      </div>

      {/* home indicator (collapses as the keyboard takes over) */}
      <div
        style={{
          height: 26 * (1 - kb),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: 134,
            height: 5,
            borderRadius: 99,
            backgroundColor: C.ink,
            opacity: 1 - kb,
          }}
        />
      </div>

      {/* The drawer only reserves layout space, so the input bar rides up in
          lockstep with the keyboard — the keyboard itself travels in from
          below the screen edge, the way it does on device. */}
      <div style={{ height: KEYBOARD_H * kb }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          transform: `translateY(${(1 - kb) * KEYBOARD_H}px)`,
        }}
      >
        <Keyboard />
      </div>

      {/* the draft is read in full before it is issued */}
      <InvoicePreview frame={frame} fps={fps} content={content} />
    </div>
  );
};
