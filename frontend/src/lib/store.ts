"use client";

/**
 * Store global Zustand — TikTok Studio.
 */
import { create } from "zustand";
import type { MediaAsset, SettingsPayload, VideoProject } from "./api-contract";
import * as api from "./api";

interface StudioState {
  settings: SettingsPayload | null;
  settingsLoading: boolean;
  projects: VideoProject[];
  projectsLoading: boolean;
  assets: MediaAsset[];
  assetsLoading: boolean;
  activeJobId: string | null;

  loadSettings: () => Promise<void>;
  saveSettings: (payload: SettingsPayload) => Promise<void>;
  loadProjects: () => Promise<void>;
  loadAssets: (params?: { status?: string; niche?: string }) => Promise<void>;
  setActiveJob: (jobId: string | null) => void;
}

export const useStore = create<StudioState>((set) => ({
  settings: null,
  settingsLoading: false,
  projects: [],
  projectsLoading: false,
  assets: [],
  assetsLoading: false,
  activeJobId: null,

  loadSettings: async () => {
    set({ settingsLoading: true });
    try {
      const { settings } = await api.getSettings();
      set({ settings, settingsLoading: false });
    } catch (err) {
      console.error("loadSettings", err);
      set({ settingsLoading: false });
    }
  },

  saveSettings: async (payload) => {
    const { settings } = await api.updateSettings(payload);
    set({ settings });
  },

  loadProjects: async () => {
    set({ projectsLoading: true });
    try {
      const { items } = await api.listProjects();
      set({ projects: items, projectsLoading: false });
    } catch (err) {
      console.error("loadProjects", err);
      set({ projectsLoading: false });
    }
  },

  loadAssets: async (params) => {
    set({ assetsLoading: true });
    try {
      const { items } = await api.listAssets(params ?? {});
      set({ assets: items, assetsLoading: false });
    } catch (err) {
      console.error("loadAssets", err);
      set({ assetsLoading: false });
    }
  },

  setActiveJob: (jobId) => set({ activeJobId: jobId }),
}));
