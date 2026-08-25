import { createTikTokStyleCaptions } from "@remotion/captions";
import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { AudioEngine } from "../components/AudioEngine";
import { CaptionMask } from "../components/CaptionMask";
import { HardCutEnd } from "../components/HardCutEnd";
import { VideoSequence } from "../components/VideoTrack";
import SubtitlePage from "../components/captions/SubtitlePage";
import { FPS, TikTokVideoProps } from "../types";

// Durée d'affichage d'une page de sous-titres (comme le template officiel :
// 1200ms ≈ 3-4 mots par page — tester 500 = 1 mot à la fois, 2000 = phrase)
const SWITCH_CAPTIONS_EVERY_MS = 1200;

/**
 * Composition TikTokVideo — vidéo verticale 1080x1920 @ 30fps.
 *
 * Sous-titres : système EXACT du template officiel Remotion TikTok
 * (createTikTokStyleCaptions → pages → Sequence → SubtitlePage/Page),
 * avec la couleur d'accent du preset choisi dans le wizard.
 *
 * Structure :
 *  - VideoSequence   : rushs B-roll (cuts 3-5s, hard cuts, boucle jusqu'à la fin)
 *  - CaptionMask     : zone floutée (texte incrusté natif à masquer)
 *  - Pages captions  : sous-titres TikTok officiels (fitText + stroke + spring)
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
  const wordsPerPage = captions?.wordsPerPage ?? 3;
  // Regroupement des pages :
  //  - 1 mot  → 1 ms (chaque mot = nouvelle page)
  //  - 3 mots → 1200 ms (style officiel du template)
  const combineMs = wordsPerPage === 1 ? 1 : 1200;
  // Cap d'AFFICHAGE max d'une page (indépendant du regroupement) : la page
  // reste visible jusqu'au début de la page suivante, au plus 1200 ms.
  const displayCapMs = 1200;
  const { fps: videoFps } = useVideoConfig();
  const effectiveFps = fps || videoFps;

  // Nettoie les mots : ponctuation et apostrophes supprimées (elles cassent
  // le découpage des pages et l'affichage des sous-titres).
  const cleanWord = (w: string) =>
    w
      .replace(/[''`]/g, "")
      .replace(/[.,;:!?…«»“”"()\[\]{}–—]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // Conversion mots (secondes) → captions Remotion (millisecondes)
  const { pages } = useMemo(() => {
    const cleaned = words
      .map((w) => ({ ...w, word: cleanWord(w.word) }))
      .filter((w) => w.word.length > 0);
    const captionList = cleaned.map((w, i) => ({
      text: i === 0 ? w.word : ` ${w.word}`,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      timestampMs: null,
      confidence: null,
    }));
    return createTikTokStyleCaptions({
      captions: captionList,
      combineTokensWithinMilliseconds: combineMs,
    });
  }, [words, combineMs]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <HardCutEnd />
      <VideoSequence clips={clips} durationSeconds={durationSeconds} fps={effectiveFps} />
      <CaptionMask mask={maskArea} />
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const subtitleStartFrame = (page.startMs / 1000) * effectiveFps;
        const subtitleEndFrame = Math.min(
          nextPage ? (nextPage.startMs / 1000) * effectiveFps : Infinity,
          subtitleStartFrame + (displayCapMs / 1000) * effectiveFps,
        );
        const durationInFrames = subtitleEndFrame - subtitleStartFrame;
        // Garde-fou strict : NaN et durées non positives sautent la page
        if (!(durationInFrames > 0)) {
          return null;
        }

        return (
          <Sequence
            key={index}
            from={Math.round(subtitleStartFrame)}
            durationInFrames={Math.round(durationInFrames)}
          >
            <SubtitlePage
              key={index}
              page={page}
              highlightColor={captions?.highlightColor}
            />
          </Sequence>
        );
      })}
      <AudioEngine audioPath={audioPath} musicPath={musicPath} words={words} fps={effectiveFps} />
    </AbsoluteFill>
  );
};
