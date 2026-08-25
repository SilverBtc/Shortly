"use client";

import * as React from "react";
import { AudioLines, Loader2, Mic, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { musicAudioUrl, voiceSampleUrl, wizardMusicLibrary, wizardVoices } from "@/lib/api";
import { useWizardStore } from "@/lib/wizard-store";
import type { WizardMusicItem, WizardVoiceItem } from "@/lib/api-contract";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* 1. Voix Shortly (data/voices/*.mp3) — sélection + pré-écoute locale  */
/*    TTS généré uniquement au rendu final (daemon Qwen TTS).          */
/* ------------------------------------------------------------------ */
export function VoiceSection() {
  const { voiceId, setVoice } = useWizardStore();
  const [shortlyVoices, setShortlyVoices] = React.useState<WizardVoiceItem[]>([]);
  const [cloneAvailable, setCloneAvailable] = React.useState(false);
  const [playingSample, setPlayingSample] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    wizardVoices()
      .then((resp) => {
        setShortlyVoices(resp.items);
        setCloneAvailable(resp.clone_available);
      })
      .catch(() => setShortlyVoices([]));
  }, []);

  const toggleSample = (name: string, file: string) => {
    if (playingSample === name) {
      audioRef.current?.pause();
      setPlayingSample(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(voiceSampleUrl(file));
    audioRef.current = audio;
    audio.onended = () => setPlayingSample(null);
    audio.onerror = () => setPlayingSample(null);
    audio.play().catch(() => setPlayingSample(null));
    setPlayingSample(name);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setVoice("none")}
        className={cn(
          "mb-1 flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all",
          voiceId === "none" ? "border-amber-400 bg-amber-400/10" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600"
        )}
      >
        <span>
          <span className="block text-sm font-bold text-zinc-100">Aucune voix</span>
          <span className="block text-[10px] text-zinc-500">Montage seul (sans narration)</span>
        </span>
        <span
          className={cn(
            "flex h-5 w-9 items-center rounded-full px-0.5 transition-colors",
            voiceId === "none" ? "bg-amber-400" : "bg-zinc-700"
          )}
        >
          <span className={cn("h-4 w-4 rounded-full bg-white transition-all", voiceId === "none" ? "translate-x-4" : "")} />
        </span>
      </button>

      {/* Voix Shortly (data/voices/*.mp3) — daemon Qwen TTS au rendu */}
      {shortlyVoices.length > 0 && (
        <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-3">
          <p className="mb-2 text-[10px] leading-relaxed text-zinc-500">
            {cloneAvailable
              ? "🎙️ Daemon Qwen TTS actif — la narration utilisera le style vocal de cette voix au rendu final."
              : "Pré-écoute des voix de votre bibliothèque. La génération sera active au rendu si le daemon Qwen TTS est démarré."}
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {shortlyVoices.map((v) => {
              const voiceIdShortly = `shortly:${v.name}`;
              const active = voiceId === voiceIdShortly;
              return (
                <div
                  key={v.name}
                  onClick={() => setVoice(voiceIdShortly)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2 text-left cursor-pointer",
                    active ? "border-emerald-400 bg-emerald-400/10" : "border-zinc-800 bg-zinc-900/40 hover:border-emerald-600"
                  )}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSample(v.name, v.file);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        toggleSample(v.name, v.file);
                      }
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-amber-400"
                  >
                    {playingSample === v.name ? <Square className="h-2.5 w-2.5" /> : <Play className="ml-0.5 h-2.5 w-2.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold capitalize text-zinc-200">{v.name}</span>
                    <span className="text-[9px] text-zinc-500">
                      {v.duration ? `${Math.round(v.duration)}s` : ""} · {cloneAvailable ? "disponible" : "pré-écoute"}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {shortlyVoices.length === 0 && (
        <p className="flex items-center gap-1 text-[10px] text-zinc-500">
          <Mic className="h-3 w-3" /> Aucune voix trouvée dans backend/data/voices/
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Sous-titres cinétiques                                            */
/* ------------------------------------------------------------------ */
export function CaptionSection() {
  const { subtitlePreset, setSubtitlePreset, subtitleSpeed, setSubtitleSpeed } = useWizardStore();

  const speeds = [
    { id: "1", label: "1 mot", desc: "Ultra punchy, effet karaoké" },
    { id: "3", label: "3 mots", desc: "Style TikTok officiel" },
  ] as const;
  const presets = [
    { id: "blue-white", label: "Bleu & Blanc", swatch: "#2F80FF" },
    { id: "yellow-white", label: "Jaune & Blanc", swatch: "#FFE014" },
    { id: "green-flashy", label: "Vert flashy", swatch: "#00FF87" },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold text-zinc-400">Rythme (mots par page)</p>
        <div className="grid grid-cols-2 gap-2">
          {speeds.map((s) => (
            <button
              key={s.id}
              onClick={() => setSubtitleSpeed(s.id)}
              className={cn(
                "rounded-lg border p-2.5 text-left",
                subtitleSpeed === s.id ? "border-amber-400 bg-amber-400/10" : "border-zinc-800 bg-zinc-900/40"
              )}
            >
              <p className="text-xs font-bold text-zinc-100">{s.label}</p>
              <p className="text-[10px] text-zinc-500">{s.desc}</p>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-zinc-400">Couleur du mot en cours</p>
        <div className="grid grid-cols-3 gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => setSubtitlePreset(p.id)}
              className={cn(
                "rounded-lg border p-2.5 text-center",
                subtitlePreset === p.id ? "border-amber-400 bg-amber-400/10" : "border-zinc-800 bg-zinc-900/40"
              )}
            >
              <span
                className="mx-auto mb-1.5 block h-4 w-4 rounded-full"
                style={{ backgroundColor: p.swatch }}
              />
              <p className="text-[11px] font-semibold text-zinc-200">{p.label}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-zinc-500">
          Style TikTok officiel : pages de 3-4 mots, contour noir épais, animation spring.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Musique de fond (bibliothèque locale)                             */
/* ------------------------------------------------------------------ */
export function MusicSection() {
  const { musicPath, setMusicPath } = useWizardStore();
  const [items, setItems] = React.useState<WizardMusicItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [playing, setPlaying] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    wizardMusicLibrary()
      .then((resp) => setItems(resp.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = [...new Set(items.map((i) => i.category))];

  const togglePlay = (name: string) => {
    if (playing === name) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(musicAudioUrl(name));
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
    audio.play().catch(() => setPlaying(null));
    setPlaying(name);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={musicPath === null ? "default" : "outline"}
          size="sm"
          className={musicPath === null ? "bg-zinc-200 text-black" : ""}
          onClick={() => setMusicPath(null)}
        >
          Sans musique de fond
        </Button>
        {categories.map((cat) => (
          <span key={cat} className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
            {cat}
          </span>
        ))}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement de la bibliothèque…
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-[11px] text-zinc-500">
          Bibliothèque vide — déposez des fichiers MP3 libres de droits dans{" "}
          <code className="rounded bg-zinc-800 px-1">backend/data/music/</code> (catégories détectées
          automatiquement : suspense, dynamique, lofi, émotion…).
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => {
            const active = musicPath === item.path;
            return (
              <button
                key={item.name}
                onClick={() => setMusicPath(active ? null : item.path)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2 text-left",
                  active ? "border-amber-400 bg-amber-400/10" : "border-zinc-800 bg-zinc-900/40"
                )}
              >
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay(item.name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      togglePlay(item.name);
                    }
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-amber-400"
                >
                  {playing === item.name ? <Square className="h-3 w-3" /> : <Play className="ml-0.5 h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-zinc-200">{item.name}</span>
                  <span className="text-[10px] text-zinc-500">
                    {item.category}
                    {item.duration ? ` · ${Math.floor(item.duration / 60)}:${String(Math.round(item.duration % 60)).padStart(2, "0")}` : ""}
                  </span>
                </span>
                <AudioLines className={cn("h-3.5 w-3.5", active ? "text-amber-400" : "text-zinc-600")} />
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-zinc-500">
        Auto-ducking automatique : la musique baisse de -22 dB pendant la voix off.
      </p>
    </div>
  );
}
