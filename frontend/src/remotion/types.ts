/**
 * Types du contrat de rendu Remotion — écrits par le backend
 * (render_worker.build_render_props) et consommés par la composition TikTokVideo.
 */
export interface RemotionWord {
  word: string;
  start: number;
  end: number;
}

export interface RemotionClip {
  path: string;
  duration: number;
  isHook: boolean;
  title?: string;
  thumbnail?: string | null;
}

export interface CaptionEmoji {
  afterIndex: number;
  emoji: string;
}

/** Zone de masquage (Caption Mask) — coordonnées en % de la vidéo. */
export interface MaskArea {
  enabled: boolean;
  x: number; // pourcentage 0-100
  y: number; // pourcentage 0-100
  width: number;
  height: number;
  blurAmount: number; // ex: 12px
}

export interface TikTokVideoProps {
  audioPath: string | null;
  musicPath?: string | null;
  durationSeconds: number;
  fps?: number;
  width?: number;
  height?: number;
  banner?: {
    text: string;
    showFirstSeconds: number;
  };
  captions: {
    /** Mots horodatés (secondes) issus de Whisper */
    words: RemotionWord[];
    /** Couleur du mot en cours (preset wizard) */
    highlightColor?: string;
    /** Rythme : 1 mot ou 3 mots par page */
    wordsPerPage?: 1 | 3;
  };
  clips: RemotionClip[];
  maskArea?: MaskArea | null;
}

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Seuil de lisibilité : la voix off doit tenir dans la durée totale. */
export const MIN_WORDS = 1;
