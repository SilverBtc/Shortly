import React from "react";
import { AbsoluteFill } from "remotion";
import { AudioEngine } from "../components/AudioEngine";
import { HookBanner } from "../components/Banner";
import { CaptionMask } from "../components/CaptionMask";
import { DynamicCaptions } from "../components/Captions";
import { HardCutEnd } from "../components/HardCutEnd";
import { VideoSequence } from "../components/VideoTrack";
import { FPS, TikTokVideoProps } from "../types";

/**
 * Composition TikTokVideo — vidéo verticale 1080x1920 @ 30fps.
 *
 * Structure :
 *  - VideoSequence   : rushs B-roll (cuts 3-5s, hard cuts, boucle jusqu'à la fin)
 *  - CaptionMask     : zone floutée (texte incrusté natif à masquer)
 *  - HookBanner      : bandeau supérieur pendant les 3 premières secondes
 *  - DynamicCaptions : sous-titres mot-à-mot ou phrase par phrase + box optionnelle
 *  - AudioEngine     : voix off + musique d'ambiance avec auto-ducking (-22dB)
 *  - HardCutEnd      : coupure nette finale, aucun fondu (boucle de lecture)
 */
export const TikTokVideo: React.FC<TikTokVideoProps> = ({
  audioPath,
  musicPath,
  durationSeconds,
  fps = FPS,
  banner,
  captions,
  clips,
  maskArea,
}) => {
  const words = captions?.words ?? [];

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <HardCutEnd />
      <VideoSequence clips={clips} durationSeconds={durationSeconds} fps={fps} />
      <CaptionMask mask={maskArea} />
      <HookBanner text={banner?.text ?? ""} showFirstSeconds={banner?.showFirstSeconds ?? 3} fps={fps} />
      <DynamicCaptions
        words={words}
        emojis={captions?.emojis ?? []}
        style={captions}
        fps={fps}
        animation={captions?.animation ?? "word"}
        boxEnabled={captions?.boxEnabled ?? false}
      />
      <AudioEngine audioPath={audioPath} musicPath={musicPath} words={words} fps={fps} />
    </AbsoluteFill>
  );
};
