/**
 * CONTRAT API — TikTok Studio
 * ============================
 * Ce document est le contrat entre le backend FastAPI et le frontend Next.js.
 * Le backend est en cours de développement en parallèle ; le frontend DOIT
 * respecter exactement ces endpoints et ces types JSON.
 *
 * Base URL (côté navigateur) : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
 * Tous les endpoints métier sont préfixés par /api.
 * Le backend expose ses médias (vidéos, miniatures, audio, MP4 finaux) sous /media/<filename>.
 */

export interface MediaAsset {
  id: number;
  source_url: string;
  file_path: string;
  thumbnail_path: string | null;
  title: string | null;
  niche: string | null;
  status: "pending" | "approved" | "rejected";
  duration: number | null;
  created_at: string;
}

export interface ProjectAssetLink {
  asset: MediaAsset;
  order_index: number;
  is_hook: boolean;
}

export interface VideoProject {
  id: number;
  title: string;
  banner_text: string;
  niche: string | null;
  script_raw: string;
  script_ssml: string | null;
  status: "draft" | "ready" | "rendering" | "completed" | "failed";
  voice_id: string;
  subtitle_preset: string;
  subtitle_animation?: string;
  box_enabled?: boolean;
  mask_json?: string | null;
  music_path?: string | null;
  audio_path: string | null;
  timestamps_json: string | null;
  output_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface JobStatus {
  job_id: string;
  kind: "scrape" | "spy" | "prepare" | "render";
  status: "queued" | "running" | "completed" | "failed";
  result: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingsPayload {
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
  tts_voice: string;
  tts_rate: string;
  tts_pitch: string;
  whisper_model: string;
  whisper_device: string;
  discord_webhook_url: string;
}

/* ------------------------------------------------------------------ */
/* ENDPOINTS                                                           */
/* ------------------------------------------------------------------ */

/** GET /api/health → { status: "ok" } */

/* Module Curation */
/** GET  /api/curation/assets?status=&niche=       → { items: MediaAsset[] } */
/** POST /api/curation/scrape                       → { job_id }
 *   body: { source_type: "profile"|"hashtag"|"url", query: string, limit?: number, niche?: string }
 *   job result: { items: MediaAsset[] } */
/** POST /api/curation/assets/{id}/approve          → { item: MediaAsset } */
/** POST /api/curation/assets/{id}/reject           → { item: MediaAsset } */

/* Module Spy */
/** POST /api/spy/analyze                           → { job_id }
 *   body: { tiktok_url: string }
 *   job result: { text: string, transcript: WordTimestamp[], scripts: string[3] } */

/* Module Pipeline (projects) */
/** GET    /api/projects                                   → { items: VideoProject[] } */
/** POST   /api/projects                                   → { item: VideoProject }
 *   body: { title, banner_text?, niche?, script_raw?, voice_id?, subtitle_preset?,
 *           assets?: [{ asset_id, order_index?, is_hook? }] } */
/** GET    /api/projects/{id}                              → { item: VideoProject, assets: ProjectAssetLink[] } */
/** PATCH  /api/projects/{id}                              → { item: VideoProject }
 *   body: tout champ éditable (title, banner_text, script_raw, voice_id, subtitle_preset, ...) */
/** DELETE /api/projects/{id}                              → { ok: true } */
/** POST   /api/projects/{id}/assets                       → { item: ProjectAssetLink }
 *   body: { asset_id, order_index?, is_hook? } */
/** DELETE /api/projects/{id}/assets/{asset_id}            → { ok: true } */
/** POST   /api/projects/{id}/prepare                      → { job_id }
 *   job result: { audio_path, timestamps: WordTimestamp[], duration_seconds, script_ssml } */
/** POST   /api/projects/{id}/render                       → { job_id }
 *   job result: { output_path, output_url } */

/* Jobs (polling) */
/** GET /api/jobs/{job_id} → JobStatus */

/* Module Settings */
/** GET /api/settings → { settings: SettingsPayload } */
/** PUT /api/settings → { settings: SettingsPayload } (body: SettingsPayload) */

/* Niches (liste dynamique, extensible depuis les réglages) */
/** GET /api/settings/niches → { niches: string[] } */
/** PUT /api/settings/niches → { niches: string[] } (body: { niches: string[] }, min 1, max 20) */

/* Médias */
/** GET /media/{filename} → fichier (mp4/webp/jpg/png/mp3/json) */

/* Module Wizard (tunnel 5 étapes) */
export interface WizardLinkItem {
  id: string;
  url: string;
  title: string | null;
  thumbnail: string | null; // chemin relatif servable (/storage/...)
  video: string | null;
  duration: number | null;
  view_count: number | null;
  hashtags: string[];
  status: string;
}

export interface WizardMusicItem {
  name: string;
  category: string;
  path: string;
  duration: number | null;
}

export interface WizardVoiceItem {
  name: string;
  file: string;
  duration: number | null;
}

export interface WizardVoicesOut {
  items: WizardVoiceItem[];
  clone_available: boolean; // daemon Qwen TTS joignable → voix Shortly disponibles
}

export interface WizardMaskArea {
  enabled: boolean;
  x: number; // pourcentage 0-100
  y: number;
  width: number;
  height: number;
  blurAmount: number;
}

export interface WizardRenderLink {
  url: string;
  video?: string | null;
  thumbnail?: string | null;
  title?: string | null;
  is_hook: boolean;
}

export interface WizardRenderPayload {
  title: string;
  banner_text?: string;
  niche?: string | null;
  script: string;
  voice_id: string;
  subtitle_preset: string;
  subtitle_animation: "word" | "phrase";
  box_enabled: boolean;
  mask?: WizardMaskArea | null;
  music_path?: string | null;
  links: WizardRenderLink[];
}

/** POST /api/wizard/fetch-links → { items: WizardLinkItem[] }
 *  body: { urls: string[], niche?: string } */
/** POST /api/wizard/generate-script-from-idea → { script: string }
 *  body: { idea: string, niche?: string } */
/** POST /api/wizard/fetch-concurrent-script → { job_id }
 *  body: { url: string } (job result identique au spy : scripts[3]) */
/** POST /api/wizard/tts-preview → { audio_url }
 *  body: { text: string, voice: string } */
/** GET  /api/wizard/music-library → { items: WizardMusicItem[] } */
/** GET  /api/wizard/music/audio/{name} → mp3 (pré-écoute, nom avec ou sans extension) */
/** GET  /api/wizard/voices → { items: WizardVoiceItem[] } (échantillons Shortly) */
/** GET  /voices/{file} → mp3 (pré-écoute échantillon vocal, StaticFiles Range OK) */
/** POST /api/wizard/render → { project_id, job_id }
 *  body: { title, banner_text?, niche?, script, voice_id, subtitle_preset,
 *          subtitle_animation: "word"|"phrase", box_enabled, mask?: WizardMaskArea,
 *          music_path?: string, links: [{ url, video?, thumbnail?, title?, is_hook }] } */
/** GET  /storage/{path} → fichier temp du wizard (vidéo, miniature, preview audio) */
