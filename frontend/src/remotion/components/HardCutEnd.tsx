import React from "react";

/**
 * HardCutEnd : coupure nette en fin de vidéo.
 *
 * Volontairement sans rendu visuel : la composition TikTokVideo n'utilise
 * AUCUN fondu (ni TransitionSeries ni interpolation d'opacité en fin).
 * La vidéo s'arrête exactement à `durationInFrames` (calculé sur l'audio),
 * ce qui produit une boucle de lecture brutale = meilleur watchtime sur TikTok.
 */
export const HardCutEnd: React.FC = () => {
  return null;
};
