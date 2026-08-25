/**
 * Client API — TikTok Studio backend.
 * Contrat complet : src/lib/api-contract.ts (source de vérité).
 */
import type {
  JobStatus,
  MediaAsset,
  ProjectAssetLink,
  SettingsPayload,
  VideoProject,
  WizardLinkItem,
  WizardMaskArea,
  WizardMusicItem,
  WizardRenderPayload,
  WizardVoicesOut,
  WizardVoiceItem,
  WordTimestamp,
} from "./api-contract";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function mediaUrl(filename: string | null | undefined): string {
  if (!filename) return "";
  if (filename.startsWith("http")) return filename;
  // Chemin absolu local (…/data/media/…/fichier) -> URL /media/… servable
  const idx = filename.indexOf("/data/media/");
  if (idx >= 0) return `${API_BASE}/media${filename.slice(idx + "/data/media".length)}`;
  return `${API_BASE}/media/${filename}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body && typeof options.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!resp.ok) {
    let detail: unknown = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? body.error ?? detail;
    } catch {
      /* corps non JSON */
    }
    // detail peut être une liste (422 FastAPI) ou un objet — toujours rendre un message lisible
    const msg = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new Error(msg || `Erreur HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
const patch = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const del = <T,>(path: string) => request<T>(path, { method: "DELETE" });

// ---- Health ----
export const health = () => get<{ status: string }>("/api/health");

// ---- Curation ----
export const listAssets = (params: { status?: string; niche?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.niche) qs.set("niche", params.niche);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return get<{ items: MediaAsset[] }>(`/api/curation/assets${suffix}`);
};
export const scrapeAssets = (body: {
  source_type: "profile" | "hashtag" | "url";
  query: string;
  limit?: number;
  niche?: string;
}) => post<{ job_id: string }>("/api/curation/scrape", body);
export const approveAsset = (id: number) => post<MediaAsset>(`/api/curation/assets/${id}/approve`);
export const rejectAsset = (id: number) => post<MediaAsset>(`/api/curation/assets/${id}/reject`);

// ---- Spy ----
export const spyAnalyze = (tiktokUrl: string) => post<{ job_id: string }>("/api/spy/analyze", { tiktok_url: tiktokUrl });

// ---- Pipeline ----
export const listProjects = () => get<{ items: VideoProject[] }>("/api/projects");
export const createProject = (body: Partial<VideoProject> & { title: string }) =>
  post<{ item: VideoProject }>("/api/projects", body);
export const getProject = (id: number) =>
  get<{ item: VideoProject; assets: ProjectAssetLink[] }>(`/api/projects/${id}`);
export const updateProject = (id: number, body: Partial<VideoProject>) =>
  patch<{ item: VideoProject }>(`/api/projects/${id}`, body);
export const deleteProject = (id: number) => del<{ ok: boolean }>(`/api/projects/${id}`);
export const addProjectAsset = (id: number, body: { asset_id: number; order_index?: number; is_hook?: boolean }) =>
  post<{ item: ProjectAssetLink }>(`/api/projects/${id}/assets`, body);
export const removeProjectAsset = (id: number, assetId: number) =>
  del<{ ok: boolean }>(`/api/projects/${id}/assets/${assetId}`);
export const prepareProject = (id: number) => post<{ job_id: string }>(`/api/projects/${id}/prepare`);
export const renderProject = (id: number) => post<{ job_id: string }>(`/api/projects/${id}/render`);

// ---- Jobs ----
export const getJob = (jobId: string) => get<JobStatus>(`/api/jobs/${jobId}`);
export const listJobs = () => get<{ items: JobStatus[] }>("/api/jobs");

// ---- Settings ----
export const getSettings = () => get<{ settings: SettingsPayload }>("/api/settings");
export const updateSettings = (payload: SettingsPayload) =>
  put<{ settings: SettingsPayload }>("/api/settings", payload);

// ---- Niches (liste dynamique) ----
export const getNiches = () => get<{ niches: string[] }>("/api/settings/niches");
export const updateNiches = (niches: string[]) =>
  put<{ niches: string[] }>("/api/settings/niches", { niches });

// ---- Wizard (tunnel 5 étapes) ----
export const wizardFetchLinks = (urls: string[], niche?: string) =>
  post<{ items: WizardLinkItem[] }>("/api/wizard/fetch-links", { urls, niche });
export const wizardGenerateScript = (idea: string, niche?: string) =>
  post<{ script: string }>("/api/wizard/generate-script-from-idea", { idea, niche });
export const wizardOptimizeScript = (script: string) =>
  post<{ script: string }>("/api/wizard/optimize-script", { script });
export const wizardFetchConcurrent = (url: string) =>
  post<{ job_id: string }>("/api/wizard/fetch-concurrent-script", { url });
export const wizardTtsPreview = (text: string, voice: string) =>
  post<{ audio_url: string }>("/api/wizard/tts-preview", { text, voice });
export const wizardMusicLibrary = () => get<{ items: WizardMusicItem[] }>("/api/wizard/music-library");
export const wizardVoices = () => get<WizardVoicesOut>("/api/wizard/voices");
export const wizardRender = (body: WizardRenderPayload) =>
  post<{ project_id: number; job_id: string }>("/api/wizard/render", body);

// ---- Voice Design (Qwen3-TTS) ----
export interface VoiceDesignParams {
  temperature: number;
  top_p: number;
  top_k: number;
  repetition_penalty: number;
  subtalker_temperature?: number | null;
  subtalker_top_p?: number | null;
  subtalker_top_k?: number | null;
}
export interface VoiceDesignPlan {
  script: string;
  instruct: string;
  params: VoiceDesignParams;
}
export const voiceDesignStatus = () =>
  get<{ available: boolean; url: string }>("/api/voice-design/status");
export const voiceDesignPlan = (situation: string, durationS: number, language = "Français") =>
  post<VoiceDesignPlan>("/api/voice-design/plan", { situation, duration_s: durationS, language });
export const voiceDesignGenerate = (body: { text: string; instruct: string; language?: string; params: VoiceDesignParams }) =>
  post<{ audio_url: string; duration_s: number; elapsed_s?: number }>("/api/voice-design/generate", body);
// L'audio est écrit dans storage/temp/qwen/ → servi par le mount /storage (Range OK)
export const voiceDesignAudioUrl = (relPath: string) => storageUrl(relPath);

export function storageUrl(relPath: string | null | undefined): string {
  if (!relPath) return "";
  if (relPath.startsWith("http")) return relPath;
  return `${API_BASE}/storage/${relPath}`;
}

export function musicAudioUrl(name: string): string {
  return `${API_BASE}/api/wizard/music/audio/${encodeURIComponent(name)}`;
}

export function voiceSampleUrl(file: string): string {
  return `${API_BASE}/voices/${encodeURIComponent(file)}`;
}

function put<T>(path: string, body: unknown) {
  return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

// ---- Helpers de job (polling) ----
export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export async function pollJob(
  jobId: string,
  { intervalMs = 1200, timeoutMs = 600_000 }: PollOptions = {}
): Promise<JobStatus> {
  const start = Date.now();
  for (;;) {
    const job = await getJob(jobId);
    if (job.status === "completed" || job.status === "failed") return job;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Job ${jobId} : timeout après ${Math.round(timeoutMs / 1000)}s`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export function projectToPreviewProps(
  project: VideoProject,
  assets: ProjectAssetLink[],
  timestamps: WordTimestamp[],
  durationSeconds: number,
  audioPath: string
) {
  return {
    audioPath,
    musicPath: project.music_path ? musicAudioUrl(project.music_path.split(/[\\/]/).pop() ?? "") : null,
    durationSeconds,
    fps: 30,
    width: 1080,
    height: 1920,
    captions: {
      words: timestamps,
      highlightColor: presetFor(project.subtitle_preset),
    },
    clips: assets.map((link, idx) => ({
      path: link.asset.file_path,
      duration: link.asset.duration ?? 4,
      isHook: link.is_hook || idx === 0,
      title: link.asset.title ?? undefined,
      thumbnail: link.asset.thumbnail_path,
    })),
  };
}

const PRESETS: Record<string, string> = {
  classic: "#FFE014",
  bold: "#FF3B3B",
  neon: "#00FFCC",
  "blue-white": "#2F80FF",
  "yellow-white": "#FFE014",
  "green-flashy": "#00FF87",
};

function presetFor(name: string) {
  return PRESETS[name] ?? PRESETS.classic;
}
