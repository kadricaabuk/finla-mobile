import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Stage } from "./Stage";
import { Phone } from "./Phone";
import { OUTRO_FADE, Outro } from "../shared/Outro";
import { ChatScreen } from "./screen/ChatScreen";
import { T, getCamera } from "./timeline";
import { cameraTransform } from "../shared/camera";
import { easeRamp } from "../shared/anim";
import type { IntroContent } from "./content";

export const Intro: React.FC<IntroContent> = (content) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const cam = getCamera(frame, width, height);

  // The end card dissolves over the last shot rather than cutting, so the camera
  // is still drifting underneath as the black comes up.
  const outroIn = easeRamp(frame, T.OUTRO, T.OUTRO + OUTRO_FADE);

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
              <ChatScreen frame={frame} fps={fps} content={content} />
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
