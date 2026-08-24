"use client";

import * as React from "react";
import { Player } from "@remotion/player";
import { TikTokVideo } from "@/remotion/compositions/TikTokVideo";
import type { TikTokVideoProps } from "@/remotion/types";

interface VideoPreviewProps {
  props: TikTokVideoProps | null;
  className?: string;
}

/**
 * Prévisualisation temps réel via @remotion/player.
 * Timeline, lecture en boucle, sous-titres et bannière contrôlables.
 */
export const VideoPreview: React.FC<VideoPreviewProps> = ({ props, className }) => {
  if (!props || (!props.audioPath && (!props.clips || props.clips.length === 0))) {
    return (
      <div className={`flex aspect-[9/16] items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950 text-sm text-zinc-600 ${className ?? ""}`}>
        Préparez le projet pour prévisualiser la vidéo
      </div>
    );
  }

  const fps = props.fps ?? 30;
  const durationInFrames = Math.max(1, Math.round((props.durationSeconds || 1) * fps));

  return (
    <div className={`overflow-hidden rounded-lg border border-zinc-800 bg-black shadow-xl ${className ?? ""}`}>
      <Player
        component={TikTokVideo as unknown as React.ComponentType<Record<string, unknown>>}
        inputProps={props as unknown as Record<string, unknown>}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={props.width ?? 1080}
        compositionHeight={props.height ?? 1920}
        style={{ width: "100%", aspectRatio: "9 / 16" }}
        controls
        loop
        autoPlay={false}
      />
    </div>
  );
};
