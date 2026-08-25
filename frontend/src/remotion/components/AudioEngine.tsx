import React from "react";
import { Audio, useCurrentFrame } from "remotion";
import { FPS, RemotionWord } from "../types";

interface AudioEngineProps {
  audioPath: string | null;
  musicPath?: string | null;
  words: RemotionWord[];
  fps?: number;
}

const MUSIC_DUCKED = 0.16; // -16 dB pendant la parole (présente mais discrète)
const MUSIC_NORMAL = 0.5;

/**
 * AudioEngine : voix off principale + musique d'ambiance en boucle.
 * Auto-ducking : le volume de la musique est abaissé à -22 dB (0.08)
 * pendant qu'un mot de la voix off est actif, remonté sinon.
 */
export const AudioEngine: React.FC<AudioEngineProps> = ({ audioPath, musicPath, words, fps = FPS }) => {
  const frame = useCurrentFrame();
  const t = frame / fps;

  const wordActive = (words ?? []).some((w) => t >= w.start && t < w.end);

  return (
    <>
      {audioPath ? <Audio src={audioPath} volume={1} /> : null}
      {musicPath ? <Audio src={musicPath} loop volume={wordActive ? MUSIC_DUCKED : MUSIC_NORMAL} /> : null}
    </>
  );
};
