import React from "react";
import { Composition } from "remotion";
import { TikTokVideo } from "./compositions/TikTokVideo";
import { FPS, HEIGHT, TikTokVideoProps, WIDTH } from "./types";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TikTokVideo"
        component={TikTokVideo as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={30}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          audioPath: "",
          musicPath: null,
          durationSeconds: 1,
          fps: FPS,
          width: WIDTH,
          height: HEIGHT,
          banner: { text: "BANNIÈRE", showFirstSeconds: 3 },
          captions: {
            words: [{ word: "…", start: 0, end: 1 }],
            highlightColor: "#FFE014",
          },
          clips: [],
        }}
        calculateMetadata={({ props }) => {
          const p = props as unknown as TikTokVideoProps;
          const fps = p.fps ?? FPS;
          const durationSeconds = Math.max(0.1, p.durationSeconds || 1);
          return {
            durationInFrames: Math.max(1, Math.round(durationSeconds * fps)),
            props: props as Record<string, unknown>,
          };
        }}
      />
    </>
  );
};
