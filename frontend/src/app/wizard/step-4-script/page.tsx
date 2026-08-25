"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Download,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getJob, wizardFetchConcurrent, voiceDesignPlan, type VoiceDesignParams } from "@/lib/api";
import { useWizardStore } from "@/lib/wizard-store";
import type { JobStatus } from "@/lib/api-contract";
import { cn } from "@/lib/utils";

const DURATION_PRESETS = [30, 45, 60, 90];

/* Compte les mots réellement parlés */
const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
/* ~2.4 mots/seconde à l'oral (mesure TTS fr) */
const estimateSeconds = (s: string) => countWords(s) / 2.4;

const PARAM_RANGES: Record<keyof VoiceDesignParams, { min: number; max: number; step: number; label: string; hint: string }> = {
  temperature: { min: 0.7, max: 1.2, step: 0.05, label: "Temperature", hint: "0.8 posé → 1.15 très expressif" },
  top_p: { min: 0.85, max: 0.98, step: 0.01, label: "Top-p", hint: "Diversité lexicale de la prosodie" },
  top_k: { min: 20, max: 100, step: 5, label: "Top-k", hint: "50 = équilibre" },
  repetition_penalty: { min: 1.0, max: 1.15, step: 0.01, label: "Repetition Penalty", hint: "Évite les répétitions" },
  subtalker_temperature: { min: 0.7, max: 1.2, step: 0.05, label: "Subtalker Temp", hint: "Prosodie / rythme" },
  subtalker_top_p: { min: 0.85, max: 0.98, step: 0.01, label: "Subtalker Top-p", hint: "Variation d'intonation" },
  subtalker_top_k: { min: 20, max: 100, step: 5, label: "Subtalker Top-k", hint: "50 = équilibre" },
};

const DEFAULT_PARAMS: VoiceDesignParams = {
  temperature: 0.9,
  top_p: 0.95,
  top_k: 50,
  repetition_penalty: 1.05,
  subtalker_temperature: null,
  subtalker_top_p: null,
  subtalker_top_k: null,
};

export default function Step4ScriptPage() {
  const router = useRouter();
  const { script, setScript, voiceId } = useWizardStore();

  // Design vocal (LLM) — comme /voice-design
  const [situation, setSituation] = React.useState("");
  const [duration, setDuration] = React.useState(60);
  const [plan, setPlan] = React.useState<{ script: string; instruct: string; params: VoiceDesignParams } | null>(null);
  const [params, setParams] = React.useState<VoiceDesignParams>(DEFAULT_PARAMS);
  const [error, setError] = React.useState<string | null>(null);

  // Option B : récupération script concurrent
  const [concurrentUrl, setConcurrentUrl] = React.useState("");
  const [spyJobId, setSpyJobId] = React.useState<string | null>(null);
  const [variations, setVariations] = React.useState<string[]>([]);
  const [spyError, setSpyError] = React.useState<string | null>(null);

  const words = countWords(script);
  const seconds = estimateSeconds(script);
  const inTarget = seconds >= 58 && seconds <= 68;

  const planMutation = useMutation({
    mutationFn: () => voiceDesignPlan(situation, duration),
    onSuccess: (data) => {
      setPlan(data);
      setParams({ ...DEFAULT_PARAMS, ...data.params });
      setScript(data.script); // synchronise l'éditeur wizard (étape 5)
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Erreur génération"),
  });

  const canPlan = situation.trim().length >= 5 && !planMutation.isPending;

  React.useEffect(() => {
    if (!spyJobId) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const job = (await getJob(spyJobId)) as JobStatus;
        if (job.status === "completed") {
          window.clearInterval(timer);
          if (!cancelled) {
            const result = job.result as { scripts?: string[] };
            setVariations(result.scripts ?? []);
            setSpyError(null);
          }
        } else if (job.status === "failed") {
          window.clearInterval(timer);
          if (!cancelled) setSpyError(job.error ?? "Échec de l'analyse");
        }
      } catch {
        /* polling transitoire */
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [spyJobId]);

  const fetchConcurrent = async () => {
    if (!concurrentUrl.trim()) return;
    setSpyError(null);
    setVariations([]);
    try {
      const resp = await wizardFetchConcurrent(concurrentUrl.trim());
      setSpyJobId(resp.job_id);
    } catch (e) {
      setSpyError(e instanceof Error ? e.message : "Erreur");
    }
  };

  if (voiceId === "none") {
    return (
      <p className="rounded-lg border border-zinc-800 p-8 text-center text-sm text-zinc-500">
        Mode <strong className="text-zinc-300">Aucune voix</strong> actif : montage seul sans script.{" "}
        <Link href="/wizard/step-5-render" className="text-amber-400 hover:underline">
          Passez directement au rendu →
        </Link>
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white">
            Script IA <span className="text-amber-400">+ Design vocal</span>
          </h1>
          <p className="text-sm text-zinc-400">
            Décris ta situation et ta durée : le LLM écrit le script, conçoit la voix et règle les paramètres.
          </p>
        </div>
        <Link href="/wizard/step-3-settings" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. Ta situation */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
              <Sparkles className="h-4 w-4 text-amber-400" /> 1. Ta situation
            </CardTitle>
            <CardDescription className="text-xs">
              Décris le contexte, le ton voulu, le personnage… tout ce qui peut aider.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="situation">Prompt de situation</Label>
              <Textarea
                id="situation"
                placeholder="Ex : Panne moteur simulée à 3 000 pieds en Cessna 172, instructeur qui coupe les gaz sans prévenir, stress, atterrissage d'urgence dans un champ…"
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                className="min-h-[140px] border-zinc-800 bg-zinc-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Durée audio cible : {duration}s</Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={600}
                value={duration}
                onChange={(e) => setDuration(Math.max(5, Math.min(600, Number(e.target.value) || 60)))}
                className="border-zinc-800 bg-zinc-950"
              />
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={duration === d ? "default" : "outline"}
                    className={duration === d ? "bg-amber-400 text-black hover:bg-amber-300" : "border-zinc-800"}
                    onClick={() => setDuration(d)}
                  >
                    {d}s
                  </Button>
                ))}
              </div>
            </div>
            <Button
              className="w-full bg-amber-400 text-black hover:bg-amber-300"
              disabled={!canPlan}
              onClick={() => planMutation.mutate()}
            >
              {planMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Le LLM écrit…
                </>
              ) : (
                <>
                  <Bot className="mr-2 h-4 w-4" /> Générer script + voix + params
                </>
              )}
            </Button>
            {planMutation.isError && <p className="text-xs text-red-400">Erreur : {error}</p>}
          </CardContent>
        </Card>

        {/* 2. Design vocal (LLM) */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
              <Mic className="h-4 w-4 text-amber-400" /> 2. Design vocal (LLM)
            </CardTitle>
            <CardDescription className="text-xs">
              Script, instruct de voix et paramètres — tout est éditable avant le rendu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!plan && (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-600">
                En attente du plan IA…
              </div>
            )}
            {plan && (
              <>
                <div className="space-y-2">
                  <Label>
                    Script ({countWords(plan.script)} mots ≈ {estimateSeconds(plan.script).toFixed(0)}s)
                  </Label>
                  <Textarea
                    value={plan.script}
                    onChange={(e) => {
                      setPlan({ ...plan, script: e.target.value });
                      setScript(e.target.value);
                    }}
                    className="min-h-[120px] border-zinc-800 bg-zinc-950 text-sm"
                  />
                  {/* Compteurs dynamiques */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
                      <p className="text-lg font-black text-zinc-100">{plan.script.length}</p>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Caractères</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
                      <p className="text-lg font-black text-zinc-100">{countWords(plan.script)}</p>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Mots</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
                      <p className={cn("text-lg font-black", inTarget ? "text-emerald-400" : "text-amber-400")}>
                        {estimateSeconds(plan.script).toFixed(1)}s
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Durée estimée</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Instruct voix (description du timbre)</Label>
                  <Textarea
                    value={plan.instruct}
                    onChange={(e) => setPlan({ ...plan, instruct: e.target.value })}
                    className="min-h-[80px] border-zinc-800 bg-zinc-950 text-sm"
                  />
                </div>
                <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wide text-zinc-500">Paramètres d&apos;échantillonnage</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs text-amber-400"
                      onClick={() => setParams({ ...DEFAULT_PARAMS, ...plan.params })}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" /> Valeurs IA
                    </Button>
                  </div>
                  {(Object.keys(PARAM_RANGES) as Array<keyof VoiceDesignParams>).map((key) => {
                    const range = PARAM_RANGES[key];
                    const value = (params[key] ?? DEFAULT_PARAMS[key] ?? range.min) as number;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-400">{range.label}</span>
                          <span className="font-mono text-amber-300">{value}</span>
                        </div>
                        <input
                          type="range"
                          min={range.min}
                          max={range.max}
                          step={range.step}
                          value={value}
                          onChange={(e) => setParams({ ...params, [key]: Number(e.target.value) })}
                          className="w-full accent-amber-400"
                        />
                        <p className="text-[10px] text-zinc-600">{range.hint}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Option B — récupération script concurrent */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-amber-400" /> Récupérer un script concurrent
          </CardTitle>
          <CardDescription>
            Collez une URL TikTok : Whisper transcrit la vidéo, le LLM réécrit 3 variations originales.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={concurrentUrl}
              onChange={(e) => setConcurrentUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@user/video/1234567890"
              className="bg-zinc-900"
            />
            <Button variant="outline" onClick={fetchConcurrent} disabled={!concurrentUrl.trim() || !!spyJobId}>
              {spyJobId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Récupérer le script"}
            </Button>
          </div>
          {spyJobId && !spyError && variations.length === 0 && (
            <p className="text-[11px] text-zinc-500">Transcription + réécriture en cours… (job {spyJobId.slice(0, 8)})</p>
          )}
          {spyError && <p className="text-[11px] text-red-400">{spyError}</p>}
          {variations.length > 0 && (
            <div className="space-y-2">
              {variations.map((v, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setScript(v);
                    setVariations([]);
                  }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-left text-xs text-zinc-300 hover:border-amber-400/50"
                >
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Variation {i + 1} — cliquer pour l&apos;utiliser
                  </span>
                  {v.slice(0, 160)}…
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer — passage au rendu */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="text-xs text-zinc-500">
          {script.trim() ? (
            <>
              <strong className="text-zinc-300">{countWords(script)} mots</strong> ≈ {estimateSeconds(script).toFixed(0)}s — le
              script sera utilisé avec ta voix pour le rendu.
            </>
          ) : (
            "Aucun script pour l'instant — génère-le à gauche ou colle une URL."
          )}
        </div>
        <Button
          onClick={() => router.push("/wizard/step-5-render")}
          disabled={!script.trim()}
          className="bg-amber-400 text-black hover:bg-amber-300"
        >
          Générer la vidéo <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
