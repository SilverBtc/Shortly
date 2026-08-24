import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { FPS } from "../types";

interface HookBannerProps {
  text: string;
  showFirstSeconds?: number;
  fps?: number;
}

/**
 * HookBanner : bandeau textuel supérieur stylisé.
 * Masque les textes natifs incrustés des rushs TikTok et capte l'attention
 * dès les 3 premières secondes (fenêtre de rétention critique).
 */
export const HookBanner: React.FC<HookBannerProps> = ({ text, showFirstSeconds = 3, fps = FPS }) => {
  const frame = useCurrentFrame();
  const durationFrames = Math.round(showFirstSeconds * fps);
  if (!text) {
    return null;
  }

  const opacity = interpolate(frame, [0, 6, durationFrames - 4, durationFrames], [1, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", opacity, zIndex: 10 }}>
      <div
        style={{
          marginTop: "3.5%",
          width: "94%",
          backgroundColor: "rgba(0,0,0,0.85)",
          borderBottom: "10px solid #FFD400",
          borderRadius: 24,
          padding: "28px 36px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            color: "#FFFFFF",
            fontFamily: "Montserrat, sans-serif",
            fontWeight: 900,
            fontSize: 58,
            lineHeight: 1.12,
            textAlign: "center",
            textTransform: "uppercase",
            textShadow: "4px 4px 0 #000",
            letterSpacing: 1,
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
