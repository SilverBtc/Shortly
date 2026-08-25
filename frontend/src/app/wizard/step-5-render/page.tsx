"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  PartyPopper,
  PlayCircle,
  Send,
  Wand2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VideoPreview } from "@/components/remotion-preview/VideoPreview";
import { API_BASE, getJob, getProject, wizardRender } from "@/lib/api";
import { SUBTITLE_PRESETS, useWizardStore } from "@/lib/wizard-store";
import type { JobStatus, ProjectAssetLink, VideoProject, WordTimestamp } from "@/lib/api-contract";
import type { TikTokVideoProps } from "@/remotion/types";

const PRESET_COLORS: Record<string, string> = {
  "blue-white": "#2F80FF",
  "yellow-white": "#FFE014",
  "green-flashy": "#00FF87",
  classic: "#FFE014",
  bold: "#FF3B3B",
  neon: "#00FFCC",
};

/** Convertit un chemin local backend (…/data/media/…) en URL HTTP servable. */
function toMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const idx = path.indexOf("/data/media/");
  if (idx >= 0) return `${API_BASE}/media${path.slice(idx + "/data/media".length)}`;
  return path;
}

/** Construit l'URL HTTP de la musique de fond (servie par le backend). */
function toMusicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const name = path.split(/[\\/]/).pop(); // basename du fichier
  if (!name) return null;
  return `${API_BASE}/api/wizard/music/audio/${encodeURIComponent(name)}`;
}

export default function Step5RenderPage() {
  const {
    links,
    hookId,
    voiceId,
    subtitlePreset,
    subtitleSpeed,
    mask,
    musicPath,
    script,
    projectId,
    renderJobId,
    setRenderResult,
  } = useWizardStore();

  const [launching, setLaunching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [job, setJob] = React.useState<JobStatus | null>(null);
  const [outputUrl, setOutputUrl] = React.useState<string | null>(null);
  const [previewProps, setPreviewProps] = React.useState<TikTokVideoProps | null>(null);
  const [projectTitle, setProjectTitle] = React.useState<string>("");

  const voiceLabel = voiceId === "none" ? "Aucune voix (montage seul)" : voiceId.replace(/^shortly:/, "");
  const presetLabel = SUBTITLE_PRESETS.find((p) => p.id === subtitlePreset)?.label ?? subtitlePreset;
  const hookItem = links.find((l) => l.id === hookId);

  const launch = async () => {
    if (links.length === 0) return;
    setLaunching(true);
    setError(null);
    const defaultTitle = hookItem?.title?.slice(0, 60) ?? "Vidéo TikTok";
    try {
      const resp = await wizardRender({
        title: defaultTitle,
        script,
        voice_id: voiceId,
        subtitle_preset: subtitlePreset,
        subtitle_animation: subtitleSpeed === "1" ? "word" : "phrase",
        mask: mask.enabled ? mask : null,
        music_path: musicPath,
        links: links.map((l) => ({
          url: l.url,
          video: l.video,
          thumbnail: l.thumbnail,
          title: l.title,
          is_hook: l.id === hookId,
        })),
      });
      setRenderResult(resp.project_id, resp.job_id);
      setProjectTitle(defaultTitle);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lancement du rendu");
    } finally {
      setLaunching(false);
    }
  };

  // Poll du job render + construction de la prévisualisation après prepare
  React.useEffect(() => {
    if (!renderJobId) return;
    let cancelled = false;
    let fetched = false;
    const timer = window.setInterval(async () => {
      try {
        const current = (await getJob(renderJobId)) as JobStatus;
        if (cancelled) return;
        setJob(current);
        if (current.status === "completed") {
          window.clearInterval(timer);
          const result = current.result as { output_url?: string; output_path?: string };
          setOutputUrl(toMediaUrl(result.output_url ?? result.output_path));
        }
        // Dès que prepare est terminé (le render tourne), on peut prévisualiser
        if (!fetched && (current.status === "running" || current.status === "completed") && projectId) {
          fetched = true;
          const detail = await getProject(projectId);
          const p = detail.item as VideoProject;
          setProjectTitle(p.title);
          let words: WordTimestamp[] = [];
          try {
            words = p.timestamps_json ? (JSON.parse(p.timestamps_json) as WordTimestamp[]) : [];
          } catch {
            /* pas de timestamps (montage seul) */
          }
          const highlightColor = PRESET_COLORS[p.subtitle_preset] ?? PRESET_COLORS["yellow-white"];
          const duration = words.length > 0 ? (words.at(-1)?.end ?? 61) : 61;
          const props = {
            audioPath: toMediaUrl(p.audio_path),
            musicPath: toMusicUrl(p.music_path ?? null),
            durationSeconds: Math.max(duration, 1),
            fps: 30,
            width: 1080,
            height: 1920,
            captions: {
              words,
              highlightColor,
              wordsPerPage: (p.subtitle_animation === "word" ? 1 : 3) as 1 | 3,
            },
            clips: (detail.assets as ProjectAssetLink[]).map((link) => ({
              path: toMediaUrl(link.asset.file_path) ?? "",
              duration: link.asset.duration ?? 4,
              isHook: link.is_hook,
              title: link.asset.title ?? undefined,
              thumbnail: toMediaUrl(link.asset.thumbnail_path),
            })),
            maskArea: p.mask_json
              ? (JSON.parse(p.mask_json) as { enabled: boolean; x: number; y: number; width: number; height: number; blurAmount: number })
              : undefined,
          } as TikTokVideoProps;
          setPreviewProps(props);
        }
      } catch (e) {
        window.clearInterval(timer);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur de suivi du rendu");
          // Le job n'existe plus (404 après restart) : on nettoie le store
          useWizardStore.getState().setRenderResult(null, null);
        }
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [renderJobId, projectId]);

  const jobStatusBadge = (status?: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-500/15 text-emerald-400">Rendu terminé</Badge>;
      case "failed":
        return <Badge className="bg-red-500/15 text-red-400">Échec</Badge>;
      case "running":
        return <Badge className="bg-amber-400/15 text-amber-400">Rendu en cours</Badge>;
      case "queued":
        return <Badge className="bg-zinc-700 text-zinc-300">En file</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-amber-400" /> Prévisualisation, rendu & Discord
          </CardTitle>
          <CardDescription>
            Récap de vos choix puis lancement du rendu serveur (1080×1920, 30 fps). La notification
            Discord est envoyée automatiquement dès que le MP4 est prêt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Récapitulatif */}
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Liens</p>
              <p className="font-semibold text-zinc-200">{links.length} vidéo(s)</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Hook</p>
              <p className="truncate font-semibold text-zinc-200">{hookItem?.title?.slice(0, 28) ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Voix / Sous-titres</p>
              <p className="font-semibold text-zinc-200">
                {voiceLabel} · {presetLabel}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Musique / Mask</p>
              <p className="truncate font-semibold text-zinc-200">
                {musicPath ? musicPath.split("/").pop() : "Aucune"} · {mask.enabled ? "Masque actif" : "Sans masque"}
              </p>
            </div>
          </div>

          {!projectId && (
            <Button onClick={launch} disabled={launching} className="w-full bg-amber-400 text-black hover:bg-amber-300">
              {launching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Création du projet & lancement…
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" /> Lancer le rendu
                </>
              )}
            </Button>
          )}

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          {/* Suivi du rendu */}
          {job && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  {job.status === "completed" ? (
                    <PartyPopper className="h-4 w-4 text-emerald-400" />
                  ) : job.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                  )}
                  <span className="font-semibold text-zinc-200">
                    {projectTitle || "Vidéo TikTok"} — {jobStatusBadge(job.status)}
                  </span>
                </div>
                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <Clock className="h-3 w-3" /> job {job.job_id.slice(0, 8)}
                </span>
              </div>

              {(job.status === "queued" || job.status === "running") && (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full w-full animate-pulse rounded-full bg-amber-400/70" />
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-500">
                    {job.status === "queued"
                      ? "En file : préparation de la voix (Qwen TTS + Whisper) puis rendu Remotion…"
                      : "Rendu Remotion en cours (1080×1920, 61-66 s) — comptez plusieurs minutes sur cette machine."}
                  </p>
                </div>
              )}

              {job.status === "failed" && (
                <p className="mt-2 rounded-lg border border-red-900/50 bg-red-950/40 p-3 text-xs text-red-300">
                  {job.error ?? "Échec du rendu — consultez les logs backend."}
                </p>
              )}

              {job.status === "completed" && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs text-zinc-300">Notification Discord envoyée automatiquement.</span>
                  {outputUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a href={outputUrl} target="_blank" rel="noreferrer">
                        <Download className="mr-2 h-3.5 w-3.5 text-amber-400" /> Télécharger le MP4
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prévisualisation temps réel */}
      {previewProps && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prévisualisation temps réel</CardTitle>
            <CardDescription>
              Voix Shortly (Qwen TTS), sous-titres TikTok officiels et musique
              {mask.enabled ? " — masque actif" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <VideoPreview props={previewProps} className="w-full max-w-[320px]" />
          </CardContent>
        </Card>
      )}

      {!previewProps && !projectId && (
        <div className="flex aspect-[9/16] max-w-[320px] items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950 text-sm text-zinc-600">
          Lancez le rendu pour prévisualiser
        </div>
      )}

      <div className="flex justify-between">
        <Link href="/wizard/step-4-script" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Link>
        <Link href="/pipeline" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
          Voir le projet dans le Pipeline <Send className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
