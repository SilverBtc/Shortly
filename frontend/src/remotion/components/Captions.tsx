import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { CaptionEmoji, FPS, RemotionWord } from "../types";

interface CaptionStyle {
  activeColor: string;
  inactiveColor: string;
  highlightColor: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  strokeWidth?: number;
}

interface DynamicCaptionsProps {
  words: RemotionWord[];
  emojis?: CaptionEmoji[];
  style?: CaptionStyle;
  fps?: number;
  animation?: "word" | "phrase";
  boxEnabled?: boolean;
}

const EMPTY_STYLE: CaptionStyle = {
  activeColor: "#FFD400",
  inactiveColor: "#FFFFFF",
  highlightColor: "#3B82F6",
  fontFamily: "Montserrat, sans-serif",
  fontWeight: 800,
  fontSize: 64,
  strokeWidth: 6,
};

const STROKE = (width: number, color = "#000") =>
  `${width}px ${width}px 0 ${color}, -${width}px -${width}px 0 ${color}, ${width}px -${width}px 0 ${color}, -${width}px ${width}px 0 ${color}`;

/**
 * DynamicCaptions : sous-titres mot-à-mot percutants.
 * - Mot actif (en cours de lecture) : surbrillance activeColor + léger zoom
 * - Mots déjà lus : highlightColor (bleu)
 * - Mots à venir : inactiveColor avec contour noir épais
 * - Emojis synchronisés (pop après le mot déclencheur)
 */
export const DynamicCaptions: React.FC<DynamicCaptionsProps> = ({
  words,
  emojis = [],
  style,
  fps = FPS,
  animation = "word",
  boxEnabled = false,
}) => {
  const frame = useCurrentFrame();
  const t = frame / fps;
  const s = { ...EMPTY_STYLE, ...(style ?? {}) };

  if (!words || words.length === 0) {
    return null;
  }

  const activeIndex = words.findIndex((w) => t >= w.start && t < w.end);

  // Fenêtre : mot actif + les 2 précédents + les 4 suivants
  const start = Math.max(0, (activeIndex < 0 ? 0 : activeIndex) - 2);
  const end = Math.min(words.length, (activeIndex < 0 ? 2 : activeIndex) + 5);
  const visible = words.slice(start, end);

  const emojiMap = new Map<number, string>();
  for (const e of emojis) {
    emojiMap.set(e.afterIndex, e.emoji);
  }

  // Mode « phrase par phrase » : on découpe la fenêtre en phrases (ponctuation) —
  // la phrase contenant le mot actif s'allume entièrement.
  const phraseStart =
    animation === "phrase"
      ? (() => {
          let idx = activeIndex < 0 ? start : activeIndex;
          while (idx > start) {
            const prev = words[idx - 1];
            if (prev && /[.!?…:]\s*$/.test(prev.word)) break;
            idx -= 1;
          }
          return idx;
        })()
      : null;

  const isPhraseActive = (globalIndex: number) =>
    animation === "phrase" && phraseStart !== null && globalIndex >= phraseStart && globalIndex <= activeIndex;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", zIndex: 20, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          bottom: "12%",
          width: "100%",
          padding: "0 5%",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "10px 6px",
        }}
      >
        {visible.map((w, i) => {
          const globalIndex = start + i;
          const isActive = globalIndex === activeIndex || isPhraseActive(globalIndex);
          const isPast = globalIndex < activeIndex;
          const emoji = emojiMap.get(globalIndex);
          const emojiAge = isActive || isPast ? frame - w.end * fps : 0;
          const emojiScale = Math.min(1, emojiAge / 5 + 0.2);

          return (
            <span key={globalIndex} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  color: isActive ? s.activeColor : isPast ? s.highlightColor : s.inactiveColor,
                  fontFamily: s.fontFamily,
                  fontWeight: s.fontWeight,
                  fontSize: s.fontSize,
                  lineHeight: 1.15,
                  textShadow: STROKE(s.strokeWidth ?? 6),
                  backgroundColor: boxEnabled
                    ? isActive
                      ? "rgba(0,0,0,0.6)"
                      : isPast
                        ? "rgba(0,0,0,0.35)"
                        : "rgba(0,0,0,0.45)"
                    : isActive && animation === "word"
                      ? "rgba(0,0,0,0.45)"
                      : "transparent",
                  borderRadius: 12,
                  padding: "4px 10px",
                  transform: isActive ? "scale(1.06)" : "scale(1)",
                  transition: "transform 60ms linear",
                  whiteSpace: "pre",
                }}
              >
                {w.word}
              </span>
              {emoji ? (
                <span
                  style={{
                    fontSize: s.fontSize * 0.9,
                    transform: `scale(${emojiScale})`,
                    display: "inline-block",
                  }}
                >
                  {emoji}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
