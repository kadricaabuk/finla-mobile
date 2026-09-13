import React from "react";
import { Composition } from "remotion";
import { z } from "zod";
import { defaultInboxContent, inboxSchema } from "./inbox/content";
import { Inbox } from "./inbox/Inbox";
import { DURATION as INBOX_DURATION, FPS as INBOX_FPS } from "./inbox/timeline";
import "./index.css";
import { defaultContent, introSchema } from "./intro/content";
import { Intro } from "./intro/Intro";
import { DURATION, FPS } from "./intro/timeline";
import { Outro } from "./shared/Outro";

/** The end card on its own, so it can be previewed and rendered as a stinger. */
const outroSchema = z.object({
  wordmark: z.string(),
  slogan: z.string(),
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FinlaIntro"
        component={Intro}
        durationInFrames={DURATION}
        fps={FPS}
        width={1920}
        height={1080}
        schema={introSchema}
        defaultProps={defaultContent}
      />
      <Composition
        id="FinlaIntroPortrait"
        component={Intro}
        durationInFrames={DURATION}
        fps={FPS}
        width={1080}
        height={1920}
        schema={introSchema}
        defaultProps={defaultContent}
      />
      <Composition
        id="FinlaOutro"
        component={Outro}
        durationInFrames={3 * FPS}
        fps={FPS}
        width={1920}
        height={1080}
        schema={outroSchema}
        defaultProps={{
          wordmark: "finla",
          slogan: defaultContent.slogan,
        }}
      />
      <Composition
        id="FinlaInbox"
        component={Inbox}
        durationInFrames={INBOX_DURATION}
        fps={INBOX_FPS}
        width={1920}
        height={1080}
        schema={inboxSchema}
        defaultProps={defaultInboxContent}
      />
      <Composition
        id="FinlaInboxPortrait"
        component={Inbox}
        durationInFrames={INBOX_DURATION}
        fps={INBOX_FPS}
        width={1080}
        height={1920}
        schema={inboxSchema}
        defaultProps={defaultInboxContent}
      />
    </>
  );
};
