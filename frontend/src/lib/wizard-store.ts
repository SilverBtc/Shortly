"use client";

/**
 * Store Zustand du Wizard 5 étapes — état partagé entre les pages
 * /wizard/step-1-links … step-5-render.
 */
import { create } from "zustand";
import type { WizardLinkItem, WizardMaskArea } from "./api-contract";

export const SUBTITLE_PRESETS = [
  { id: "blue-white", label: "Bleu & Blanc", active: "#3B82F6" },
  { id: "yellow-white", label: "Jaune & Blanc", active: "#FFD400" },
  { id: "green-flashy", label: "Vert flashy", active: "#00FF88" },
] as const;

export const SUBTITLE_ANIMATIONS = [
  { id: "word", label: "Mot par mot", desc: "Style Hormozi / MrBeast" },
  { id: "phrase", label: "Phrase par phrase", desc: "Plus posé, lecture facile" },
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
  subtitleAnimation: "word" | "phrase";
  setSubtitleAnimation: (a: "word" | "phrase") => void;
  boxEnabled: boolean;
  setBoxEnabled: (b: boolean) => void;
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
  setRenderResult: (projectId: number, jobId: string) => void;
  reset: () => void;
}

const initial = {
  links: [],
  hookId: null,
  voiceId: "shortly:antoine",
  subtitlePreset: "yellow-white",
  subtitleAnimation: "word" as const,
  boxEnabled: false,
  mask: DEFAULT_MASK,
  musicPath: null,
  script: "",
  projectId: null,
  renderJobId: null,
};

export const useWizardStore = create<WizardState>((set) => ({
  ...initial,
  setLinks: (items) => set({ links: items }),
  setHook: (id) => set({ hookId: id }),
  setVoice: (voiceId) => set({ voiceId }),
  setSubtitlePreset: (subtitlePreset) => set({ subtitlePreset }),
  setSubtitleAnimation: (subtitleAnimation) => set({ subtitleAnimation }),
  setBoxEnabled: (boxEnabled) => set({ boxEnabled }),
  setMask: (mask) => set({ mask }),
  setMusicPath: (musicPath) => set({ musicPath }),
  setScript: (script) => set({ script }),
  setRenderResult: (projectId, renderJobId) => set({ projectId, renderJobId }),
  reset: () => set({ ...initial }),
}));
