import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

// Famille réellement enregistrée par @remotion/google-fonts
export const MONTSERRAT_FAMILY = loadMontserrat("normal", {
  weights: ["700", "800", "900"],
}).fontFamily;

let loaded = false;

/**
 * Pré-charge la police avant le premier rendu (pattern du template officiel :
 * delayRender/continueRender pour que Chrome Headless attende la police).
 */
export const loadFont = async (): Promise<void> => {
  if (loaded) {
    return Promise.resolve();
  }
  loaded = true;
  // @remotion/google-fonts déclenche déjà delayRender en interne ;
  // on force juste le téléchargement des glyphes utilisés.
  if (typeof document !== "undefined" && "fonts" in document) {
    await document.fonts.load(`900 100px ${MONTSERRAT_FAMILY}`);
    await document.fonts.ready;
  }
};
