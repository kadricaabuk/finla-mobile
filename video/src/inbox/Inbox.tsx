import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Stage } from "../intro/Stage";
import { Phone } from "../intro/Phone";
import { SCREEN_H, SCREEN_W } from "../intro/tokens";
import { OUTRO_FADE, Outro } from "../shared/Outro";
import { cameraTransform } from "../shared/camera";
import { easeRamp } from "../shared/anim";
import { FINLA_ICON, T, getCamera } from "./timeline";
import type { InboxContent } from "./content";
import { HomeScreen } from "./screen/HomeScreen";
import { Notification } from "./screen/Notification";
import { Splash } from "./screen/Splash";
import { AppOpen } from "./screen/AppOpen";
import { ChatScreen } from "./screen/ChatScreen";

export const Inbox: React.FC<InboxContent> = (content) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const cam = getCamera(frame, width, height);
  const outroIn = easeRamp(frame, T.OUTRO, T.OUTRO + OUTRO_FADE);

  const opening = interpolate(frame, [T.APP_OPEN, T.SPLASH_FULL], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 0.82, 0.2, 1),
  });
  const chatIn = easeRamp(frame, T.CHAT, T.CHAT + 14);
  const showHome = frame < T.SPLASH_FULL;
  const showOpen = frame >= T.ICON_PRESS && frame < T.SPLASH_FULL;
  const showSplash = frame >= T.SPLASH_FULL && frame < T.CHAT;
  const showChat = frame >= T.CHAT;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {outroIn < 1 ? (
        <>
          <Stage cam={cam} frame={frame} />
          <AbsoluteFill
            style={{
              transform: cameraTransform(cam, 1, width, height),
              transformOrigin: "0 0",
            }}
          >
            <Phone>
              <div
                style={{
                  width: SCREEN_W,
                  height: SCREEN_H,
                  position: "relative",
                  backgroundColor: "#000",
                  overflow: "hidden",
                }}
              >
                {showHome ? (
                  <div
                    style={{
                      transform: `scale(${1 + opening * 0.08})`,
                      transformOrigin: `${FINLA_ICON.left + FINLA_ICON.size / 2}px ${FINLA_ICON.top + FINLA_ICON.size / 2}px`,
                      opacity: 1 - opening * 0.55,
                    }}
                  >
                    <HomeScreen />
                    <Notification frame={frame} content={content} />
                  </div>
                ) : null}
                {showOpen ? <AppOpen frame={frame} /> : null}
                {showSplash ? <Splash frame={frame} /> : null}
                {showChat ? (
                  <div style={{ opacity: chatIn }}>
                    <ChatScreen frame={frame} fps={fps} content={content} />
                  </div>
                ) : null}
              </div>
            </Phone>
          </AbsoluteFill>
        </>
      ) : null}
      {frame >= T.OUTRO ? (
        <Outro
          frame={frame - T.OUTRO}
          fps={fps}
          slogan={content.slogan}
          logoAt={T.OUTRO_LOGO - T.OUTRO}
          sloganAt={T.OUTRO_SLOGAN - T.OUTRO}
        />
      ) : null}
    </AbsoluteFill>
  );
};
