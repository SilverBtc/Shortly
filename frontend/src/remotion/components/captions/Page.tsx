import { makeTransform, scale, translateY } from "@remotion/animation-utils";
import { fitText } from "@remotion/layout-utils";
import type { TikTokPage } from "@remotion/captions";
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { MONTSERRAT_FAMILY } from "../../load-font";

const fontFamily = MONTSERRAT_FAMILY;

// Position de la page de sous-titres (au-dessus de l'UI TikTok)
const container: React.CSSProperties = {
  justifyContent: "center",
  alignItems: "center",
  top: undefined,
  bottom: 350,
  height: 150,
};

const DESIRED_FONT_SIZE = 110;
const HIGHLIGHT_COLOR = "#39E508";

export const Page: React.FC<{
  readonly enterProgress: number;
  readonly page: TikTokPage;
  readonly highlightColor?: string;
}> = ({ enterProgress, page, highlightColor = HIGHLIGHT_COLOR }) => {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const timeInMs = (frame / fps) * 1000;

  // Auto-fit : réduit la police pour que la ligne tienne dans 90% de la largeur
  const fittedText = fitText({
    fontFamily,
    text: page.text,
    withinWidth: width * 0.9,
    textTransform: "uppercase",
  });

  const fontSize = Math.min(DESIRED_FONT_SIZE, fittedText.fontSize);

  return (
    <AbsoluteFill style={container}>
      <div
        style={{
          fontSize,
          color: "white",
          WebkitTextStroke: "20px black",
          paintOrder: "stroke",
          transform: makeTransform([
            scale(interpolate(enterProgress, [0, 1], [0.8, 1])),
            translateY(interpolate(enterProgress, [0, 1], [50, 0])),
          ]),
          fontFamily,
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            transform: makeTransform([
              scale(interpolate(enterProgress, [0, 1], [0.8, 1])),
              translateY(interpolate(enterProgress, [0, 1], [50, 0])),
            ]),
          }}
        >
          {page.tokens.map((t) => {
            const startRelativeToSequence = t.fromMs - page.startMs;
            const endRelativeToSequence = t.toMs - page.startMs;

            const active =
              startRelativeToSequence <= timeInMs &&
              endRelativeToSequence > timeInMs;

            return (
              <span
                key={t.fromMs}
                style={{
                  display: "inline",
                  whiteSpace: "pre",
                  color: active ? highlightColor : "white",
                }}
              >
                {t.text}
              </span>
            );
          })}
        </span>
      </div>
    </AbsoluteFill>
  );
};
