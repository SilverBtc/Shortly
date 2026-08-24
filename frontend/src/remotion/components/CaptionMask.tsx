import React from "react";
import { AbsoluteFill } from "remotion";
import type { MaskArea } from "../types";

/**
 * CaptionMask : floute une zone de la vidéo (texte incrusté natif).
 * - rectangle positionné en % (x, y, width, height)
 * - backdrop-filter blur selon blurAmount (ou fond sombre si non supporté)
 */
export const CaptionMask: React.FC<{ mask?: MaskArea | null }> = ({ mask }) => {
  if (!mask || !mask.enabled) {
    return null;
  }
  const left = `${mask.x}%`;
  const top = `${mask.y}%`;
  const width = `${mask.width}%`;
  const height = `${mask.height}%`;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left,
          top,
          width,
          height,
          backdropFilter: `blur(${mask.blurAmount}px) saturate(1.1)`,
          WebkitBackdropFilter: `blur(${mask.blurAmount}px) saturate(1.1)`,
          backgroundColor: "rgba(0,0,0,0.35)",
          borderRadius: 8,
        }}
      />
    </AbsoluteFill>
  );
};
