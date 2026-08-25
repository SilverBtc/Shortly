"use client";

/**
 * Store Zustand du Wizard 5 étapes — état partagé entre les pages
 * /wizard/step-1-links … step-5-render.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { WizardLinkItem, WizardMaskArea } from "./api-contract";

export const SUBTITLE_PRESETS = [
  { id: "blue-white", label: "Bleu & Blanc", active: "#2F80FF" },
  { id: "yellow-white", label: "Jaune & Blanc", active: "#FFE014" },
  { id: "green-flashy", label: "Vert flashy", active: "#00FF87" },
] as const;

export const VOICE_SAMPLE =
  "Et là... [pause] l'alarme retentit. Je n'avais que trois secondes pour réagir.";

export const DEFAULT_MASK: WizardMaskArea = {
  enabled: false,
  x: 5,
  y: 70,
  width: 90,
  height: 18,
  blurAmount: 12,
};

interface WizardState {
  // Étape 1
  links: WizardLinkItem[];
  setLinks: (items: WizardLinkItem[]) => void;
  // Étape 2
  hookId: string | null;
  setHook: (id: string | null) => void;
  // Étape 3
  voiceId: string;
  setVoice: (id: string) => void;
  subtitlePreset: string;
  setSubtitlePreset: (id: string) => void;
  /** Rythme des sous-titres : 1 mot ou 3 mots par page */
  subtitleSpeed: "1" | "3";
  setSubtitleSpeed: (s: "1" | "3") => void;
  mask: WizardMaskArea;
  setMask: (m: WizardMaskArea) => void;
  musicPath: string | null;
  setMusicPath: (p: string | null) => void;
  // Étape 4
  script: string;
  setScript: (s: string) => void;
  // Étape 5
  projectId: number | null;
  renderJobId: string | null;
  setRenderResult: (projectId: number | null, jobId: string | null) => void;
  reset: () => void;
}

const initial = {
  links: [],
  hookId: null,
  voiceId: "shortly:antoine",
  subtitlePreset: "yellow-white",
  subtitleSpeed: "3" as const,
  mask: DEFAULT_MASK,
  musicPath: null,
  script: "",
  projectId: null,
  renderJobId: null,
};

export const useWizardStore = create<WizardState>()(
  persist(
    (set) => ({
      ...initial,
      setLinks: (items) => set({ links: items }),
      setHook: (id) => set({ hookId: id }),
      setVoice: (voiceId) => set({ voiceId }),
      setSubtitlePreset: (subtitlePreset) => set({ subtitlePreset }),
      setSubtitleSpeed: (subtitleSpeed) => set({ subtitleSpeed }),
      setMask: (mask) => set({ mask }),
      setMusicPath: (musicPath) => set({ musicPath }),
      setScript: (script) => set({ script }),
      setRenderResult: (projectId, renderJobId) => set({ projectId, renderJobId }),
      reset: () => set({ ...initial }),
    }),
    {
      name: "wizard-store",
      // Survit aux refresh : musique/presets/script ne sont plus perdus au rendu
      storage: createJSONStorage(() => localStorage),
    }
  )
);
