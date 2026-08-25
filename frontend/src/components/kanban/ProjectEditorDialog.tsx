"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Film,
  Loader2,
  Mic,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import * as api from "@/lib/api";
import type { ProjectAssetLink, VideoProject, WordTimestamp } from "@/lib/api-contract";
import { useNiches } from "@/lib/use-niches";
import { formatDuration } from "@/lib/utils";
import { VideoPreview } from "@/components/remotion-preview/VideoPreview";

const VOICES = ["shortly:antoine", "shortly:hugo", "shortly:marie", "shortly:maxime", "shortly:nicolas", "shortly:paul"];
const PRESETS = ["classic", "bold", "neon"];

const TAGS = [
  { label: "[pause]", value: "[pause]" },
  { label: "[pause courte]", value: "[pause courte]" },
  { label: "[rapide]", value: "[rapide]" },
  { label: "[/rapide]", value: "[/rapide]" },
  { label: "[insistance]", value: "[insistance]" },
  { label: "[/insistance]", value: "[/insistance]" },
  { label: "[grave]", value: "[grave]" },
  { label: "[/grave]", value: "[/grave]" },
  { label: "[chuchotement]", value: "[chuchotement]" },
  { label: "[/chuchotement]", value: "[/chuchotement]" },
];

interface ProjectEditorDialogProps {
  projectId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const ProjectEditorDialog: React.FC<ProjectEditorDialogProps> = ({ projectId, open, onClose, onSaved }) => {
  const qc = useQueryClient();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const { data: niches } = useNiches();
  const nicheOptions = niches ?? [];

  const [title, setTitle] = React.useState("");
  const [niche, setNiche] = React.useState("");
  const [scriptRaw, setScriptRaw] = React.useState("");
  const [voiceId, setVoiceId] = React.useState("shortly:antoine");
  const [preset, setPreset] = React.useState("classic");
  const [linked, setLinked] = React.useState<ProjectAssetLink[]>([]);

  const [audioPath, setAudioPath] = React.useState<string | null>(null);
  const [timestamps, setTimestamps] = React.useState<WordTimestamp[]>([]);
  const [duration, setDuration] = React.useState<number>(0);
  const [outputUrl, setOutputUrl] = React.useState<string | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const [rendering, setRendering] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedProject, setSavedProject] = React.useState<VideoProject | null>(null);

  const { data: approvedData } = useQuery({
    queryKey: ["assets-approved"],
    queryFn: () => api.listAssets({ status: "approved" }),
    enabled: open,
  });
  const approvedAssets = approvedData?.items ?? [];

  const { data: detail } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId as number),
    enabled: open && !!projectId,
  });

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setAudioPath(null);
    setTimestamps([]);
    setDuration(0);
    setOutputUrl(null);
    setPreparing(false);
    setRendering(false);

    if (projectId && detail) {
      const p = detail.item;
      setTitle(p.title);
      setNiche(p.niche ?? "");
      setScriptRaw(p.script_raw);
      setVoiceId(p.voice_id);
      setPreset(p.subtitle_preset);
      setLinked(detail.assets);
      setSavedProject(p);
      if (p.audio_path && p.timestamps_json) {
        try {
          setAudioPath(p.audio_path);
          setTimestamps(JSON.parse(p.timestamps_json) as WordTimestamp[]);
          setDuration(p.timestamps_json ? (JSON.parse(p.timestamps_json) as WordTimestamp[]).at(-1)?.end ?? 0 : 0);
        } catch {
          /* timestamps corrompus : on laisse vide */
        }
      }
      setOutputUrl(p.output_path ? `/media/output/${p.output_path.split("/").pop()}` : null);
    } else {
      setTitle("");
      setNiche("");
      setScriptRaw("");
      setVoiceId("shortly:antoine");
      setPreset("classic");
      setLinked([]);
      setSavedProject(null);
    }
  }, [open, projectId, detail]);

  const wordCount = scriptRaw ? scriptRaw.split(/\s+/).filter(Boolean).length : 0;

  const insertTag = (tag: string) => {
    const el = textareaRef.current;
    if (!el) {
      setScriptRaw((s) => `${s} ${tag}`);
      return;
    }
    const start = el.selectionStart ?? scriptRaw.length;
    const end = el.selectionEnd ?? scriptRaw.length;
    const next = scriptRaw.slice(0, start) + tag + scriptRaw.slice(end);
    setScriptRaw(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const save = async () => {
    try {
      let item: VideoProject;
      if (projectId) {
        const res = await api.updateProject(projectId, {
          title,
          niche: niche || null,
          script_raw: scriptRaw,
          voice_id: voiceId,
          subtitle_preset: preset,
        });
        item = res.item;
      } else {
        const res = await api.createProject({
          title: title || "Projet sans titre",
          niche: niche || undefined,
          script_raw: scriptRaw,
          voice_id: voiceId,
          subtitle_preset: preset,
        });
        item = res.item;
      }
      setSavedProject(item);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de sauvegarde");
    }
  };

  const prepare = async () => {
    if (!savedProject) {
      await save();
    }
    const pid = savedProject?.id ?? projectId;
    if (!pid) return;
    setPreparing(true);
    setError(null);
    try {
      const { job_id } = await api.prepareProject(pid);
      const job = await api.pollJob(job_id, { timeoutMs: 300_000 });
      if (job.status === "failed") throw new Error(job.error ?? "Préparation en échec");
      const result = job.result as { audio_path: string; timestamps: WordTimestamp[]; duration_seconds: number };
      setAudioPath(result.audio_path);
      setTimestamps(result.timestamps);
      setDuration(result.duration_seconds);
      qc.invalidateQueries({ queryKey: ["project", pid] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de préparation");
    } finally {
      setPreparing(false);
    }
  };

  const render = async () => {
    if (!savedProject) await save();
    const pid = savedProject?.id ?? projectId;
    if (!pid) return;
    setRendering(true);
    setError(null);
    try {
      const { job_id } = await api.renderProject(pid);
      const job = await api.pollJob(job_id, { timeoutMs: 1_800_000 });
      if (job.status === "failed") throw new Error(job.error ?? "Rendu en échec");
      const result = job.result as { output_url: string };
      setOutputUrl(result.output_url);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", pid] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de rendu");
    } finally {
      setRendering(false);
    }
  };

  const toggleAsset = async (assetId: number) => {
    if (!savedProject) await save();
    const pid = savedProject?.id ?? projectId;
    if (!pid) return;
    try {
      if (linked.some((l) => l.asset.id === assetId)) {
        await api.removeProjectAsset(pid, assetId);
        setLinked((ls) => ls.filter((l) => l.asset.id !== assetId));
      } else {
        const { item } = await api.addProjectAsset(pid, { asset_id: assetId, order_index: linked.length });
        setLinked((ls) => [...ls, item]);
      }
      qc.invalidateQueries({ queryKey: ["project", pid] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de liaison d'asset");
    }
  };

  const reorder = (index: number, dir: -1 | 1) => {
    const next = [...linked];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setLinked(next);
    if (savedProject) {
      next.forEach((l, i) =>
        api.addProjectAsset(savedProject.id, { asset_id: l.asset.id, order_index: i, is_hook: l.is_hook }).catch(() => undefined)
      );
    }
  };

  const toggleHook = (assetId: number) => {
    const next = linked.map((l) => ({ ...l, is_hook: l.asset.id === assetId ? !l.is_hook : l.is_hook }));
    setLinked(next);
    if (savedProject) {
      api.addProjectAsset(savedProject.id, { asset_id: assetId, order_index: next.find((l) => l.asset.id === assetId)?.order_index ?? 0, is_hook: next.find((l) => l.asset.id === assetId)?.is_hook }).catch(() => undefined);
    }
  };

  const previewProps = React.useMemo(() => {
    if (!savedProject || !audioPath || timestamps.length === 0) return null;
    return api.projectToPreviewProps(
      { ...savedProject, script_raw: scriptRaw, subtitle_preset: preset },
      linked,
      timestamps,
      duration || (timestamps.at(-1)?.end ?? 0),
      audioPath
    );
  }, [savedProject, audioPath, timestamps, duration, linked, scriptRaw, preset]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl border-zinc-800 bg-zinc-950">
        <DialogHeader>
          <DialogTitle>{projectId ? "Éditeur de projet" : "Nouveau projet"}</DialogTitle>
          <DialogDescription>
            Script balisé, rushs B-roll, style des sous-titres, prévisualisation et rendu Remotion.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] grid-cols-2 gap-6 overflow-y-auto pr-2">
          {/* ---------- Colonne gauche : script & style ---------- */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Titre</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mon projet viral" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Niche</Label>
                <Select value={niche} onValueChange={setNiche}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {nicheOptions.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-400">Script (avec balises de rythme)</Label>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${wordCount >= 135 && wordCount <= 155 ? "bg-emerald-900/60 text-emerald-300" : "bg-amber-900/40 text-amber-300"}`}>
                  {wordCount} mots (135-155)
                </span>
              </div>
              <Textarea
                ref={textareaRef}
                className="min-h-[220px] font-mono text-xs leading-relaxed"
                value={scriptRaw}
                onChange={(e) => setScriptRaw(e.target.value)}
                placeholder={"J'ai nettoyé l'appartement d'un mec qui [pause] planquait [insistance]un truc incroyable[/insistance]…"}
              />
              <div className="flex flex-wrap gap-1">
                {TAGS.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => insertTag(t.value)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-amber-300 hover:bg-zinc-800"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Voix (Shortly — Qwen TTS)</Label>
                <Select value={voiceId} onValueChange={setVoiceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Style sous-titres</Label>
                <Select value={preset} onValueChange={setPreset}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
              <Button onClick={save} variant="secondary" size="sm">
                <Save className="h-3.5 w-3.5" /> Sauvegarder
              </Button>
              <Button onClick={prepare} size="sm" disabled={preparing || !scriptRaw.trim()}>
                {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                {preparing ? "Préparation…" : "Préparer (TTS + Whisper)"}
              </Button>
              <Button
                onClick={render}
                size="sm"
                disabled={rendering || !savedProject || !scriptRaw.trim()}
                className="bg-amber-500 text-black hover:bg-amber-400"
              >
                {rendering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
                {rendering ? "Rendu en cours…" : "Générer la vidéo"}
              </Button>
            </div>

            {audioPath ? (
              <div className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-xs text-emerald-300">
                <div className="flex items-center gap-2 font-bold">
                  <Check className="h-3.5 w-3.5" /> Médias prêts
                </div>
                <div className="mt-1 text-emerald-400/80">
                  {timestamps.length} mots · durée voix off {duration.toFixed(1)}s
                  {duration < 55 ? " ⚠️ script trop court (cible 61-68s)" : duration > 72 ? " ⚠️ script trop long" : " ✓ dans la cible 61-68s"}
                </div>
              </div>
            ) : null}

            {outputUrl ? (
              <div className="rounded-lg border border-blue-900 bg-blue-950/30 p-3 text-xs text-blue-300">
                <div className="flex items-center gap-2 font-bold">
                  <Sparkles className="h-3.5 w-3.5" /> Vidéo générée
                </div>
                <a href={outputUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-blue-400 underline">
                  {outputUrl} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">{error}</div>
            ) : null}
          </div>

          {/* ---------- Colonne droite : rushs + préview ---------- */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">
                Rushs B-roll (bibliothèque approuvée) — 1er = hook 3s
              </Label>
              <div className="grid max-h-36 grid-cols-4 gap-2 overflow-y-auto pr-1">
                {approvedAssets.map((a) => {
                  const linkedItem = linked.find((l) => l.asset.id === a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAsset(a.id)}
                      className={`relative aspect-[9/16] overflow-hidden rounded-md border transition-colors ${
                        linkedItem ? "border-amber-500 ring-1 ring-amber-500" : "border-zinc-800 hover:border-zinc-600"
                      }`}
                      title={a.title ?? a.file_path}
                    >
                      {a.thumbnail_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={api.mediaUrl(a.thumbnail_path)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-zinc-900 text-[8px] text-zinc-600">
                          {formatDuration(a.duration)}
                        </div>
                      )}
                      {linkedItem ? (
                        <div className="absolute inset-x-0 bottom-0 bg-amber-500/90 py-0.5 text-center text-[8px] font-black text-black">
                          {linkedItem.is_hook ? "HOOK" : `#${linkedItem.order_index + 1}`}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {linked.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Ordre des clips</Label>
                <div className="space-y-1">
                  {linked.map((l, idx) => (
                    <div key={l.asset.id} className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-xs">
                      <span className="w-5 font-mono text-zinc-600">{idx + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-zinc-300">
                        {l.asset.title ?? l.asset.file_path.split("/").pop()}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleHook(l.asset.id)}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${l.is_hook ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
                      >
                        HOOK
                      </button>
                      <button type="button" onClick={() => reorder(idx, -1)} className="text-zinc-500 hover:text-white">
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => reorder(idx, 1)} className="text-zinc-500 hover:text-white">
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button type="button" onClick={() => toggleAsset(l.asset.id)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <Label className="text-xs text-zinc-400">Prévisualisation (Remotion Player)</Label>
              <div className="mt-2 flex justify-center">
                <VideoPreview props={previewProps} className="w-56" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-zinc-800 pt-4">
          <Badge variant="outline" className="text-zinc-500">
            Cible : 61-68s · 1080×1920 · 30 fps · Hard cut final
          </Badge>
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
