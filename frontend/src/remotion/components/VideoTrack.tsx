import React from "react";
import { OffthreadVideo, Sequence, AbsoluteFill } from "remotion";
import { FPS, RemotionClip } from "../types";

interface VideoSequenceProps {
  clips: RemotionClip[];
  durationSeconds: number;
  fps?: number;
}

/**
 * VideoSequence : enchaînement dynamique des rushs B-roll.
 * - Chaque clip occupe sa propre Sequence (coupe franche = hard cut, pas de fondu)
 * - Les clips sont découpés ~3-5s (durée stockée dans le props)
 * - Si la somme des clips < durée audio : boucle cyclique jusqu'à la fin
 * - Le clip isHook (accroche) est placé en premier
 */
export const VideoSequence: React.FC<VideoSequenceProps> = ({ clips, durationSeconds, fps = FPS }) => {
  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));

  if (!clips || clips.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }} />;
  }

  const ordered = [...clips].sort((a, b) => Number(b.isHook) - Number(a.isHook));
  const clipFrames = ordered.map((clip) => Math.max(1, Math.round((clip.duration || 4) * fps)));
  const totalClipFrames = clipFrames.reduce((sum, f) => sum + f, 0);
  const loops = Math.max(1, Math.ceil(totalFrames / Math.max(1, totalClipFrames)));

  const segments: React.ReactNode[] = [];
  let cursor = 0;

  for (let loop = 0; loop < loops && cursor < totalFrames; loop++) {
    for (let i = 0; i < ordered.length && cursor < totalFrames; i++) {
      const clip = ordered[i];
      const frames = clipFrames[i];
      const remaining = totalFrames - cursor;
      const durationInFrames = Math.min(frames, remaining);

      segments.push(
        <Sequence
          key={`${loop}-${i}`}
          from={cursor}
          durationInFrames={durationInFrames}
          layout="none"
        >
          <AbsoluteFill>
            <OffthreadVideo
              src={clip.path}
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </AbsoluteFill>
        </Sequence>
      );
      cursor += frames;
    }
  }

  return <AbsoluteFill style={{ backgroundColor: "#000" }}>{segments}</AbsoluteFill>;
};
