"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AudioLines,
  Bot,
  Cpu,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import * as api from "@/lib/api";
import type { VoiceDesignParams } from "@/lib/api";

const DURATION_PRESETS = [15, 30, 45, 60, 90];

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

export default function VoiceDesignPage() {
  const [situation, setSituation] = React.useState("");
  const [duration, setDuration] = React.useState(60);
  const [plan, setPlan] = React.useState<api.VoiceDesignPlan | null>(null);
  const [params, setParams] = React.useState<VoiceDesignParams>(DEFAULT_PARAMS);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [audioDuration, setAudioDuration] = React.useState<number | null>(null);

  const { data: status } = useQuery({
    queryKey: ["voice-design-status"],
    queryFn: api.voiceDesignStatus,
    refetchInterval: 15_000,
  });

  const planMutation = useMutation({
    mutationFn: () => api.voiceDesignPlan(situation, duration),
    onSuccess: (data) => {
      setPlan(data);
      setParams({ ...DEFAULT_PARAMS, ...data.params });
      setAudioUrl(null);
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.voiceDesignGenerate({
        text: plan!.script,
        instruct: plan!.instruct,
        params,
      }),
    onSuccess: (data) => {
      setAudioUrl(api.voiceDesignAudioUrl(data.audio_url));
      setAudioDuration(data.duration_s);
    },
  });

  const canPlan = situation.trim().length >= 5 && !planMutation.isPending;
  const canGenerate = !!plan && status?.available && !generateMutation.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Héro */}
      <div className="rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/10 via-zinc-900 to-zinc-950 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-violet-400">
              <AudioLines className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-widest">Qwen3-TTS VoiceDesign</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white">
              Décris la situation, l&apos;IA crée la <span className="text-violet-400">voix parfaite</span>
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-400">
              Entre ton prompt et la durée : le LLM écrit le script, conçoit la voix (instruct) et règle
              les paramètres optimaux. Tu n&apos;as plus qu&apos;à écouter.
            </p>
          </div>
          <Badge variant={status?.available ? "success" : "destructive"} className="shrink-0">
            <Cpu className="mr-1 h-3 w-3" />
            {status?.available ? "Daemon prêt" : "Daemon off"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Colonne gauche : input */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
              <Sparkles className="h-4 w-4 text-violet-400" /> 1. Ta situation
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
                placeholder="Ex : Une infirmière épuisée confie en chuchotant ce qu'elle a vu de plus étrange pendant son service de nuit à l'hôpital…"
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
                    className={duration === d ? "bg-violet-500 text-white hover:bg-violet-400" : "border-zinc-800"}
                    onClick={() => setDuration(d)}
                  >
                    {d}s
                  </Button>
                ))}
              </div>
            </div>
            <Button
              className="w-full bg-violet-500 text-white hover:bg-violet-400"
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
            {planMutation.isError && (
              <p className="text-xs text-red-400">Erreur : {(planMutation.error as Error).message}</p>
            )}
          </CardContent>
        </Card>

        {/* Colonne droite : résultat LLM */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
              <Mic className="h-4 w-4 text-violet-400" /> 2. Design vocal (LLM)
            </CardTitle>
            <CardDescription className="text-xs">
              Script, instruct de voix et paramètres — tout est éditable avant génération.
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
                  <Label>Script ({plan.script.split(/\s+/).length} mots ≈ {Math.round(plan.script.split(/\s+/).length / 2.3)}s)</Label>
                  <Textarea
                    value={plan.script}
                    onChange={(e) => setPlan({ ...plan, script: e.target.value })}
                    className="min-h-[120px] border-zinc-800 bg-zinc-950 text-sm"
                  />
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
                      className="h-6 text-xs text-violet-400"
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
                          <span className="font-mono text-violet-300">{value}</span>
                        </div>
                        <input
                          type="range"
                          min={range.min}
                          max={range.max}
                          step={range.step}
                          value={value}
                          onChange={(e) => setParams({ ...params, [key]: Number(e.target.value) })}
                          className="w-full accent-violet-500"
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

      {/* Génération audio */}
      {plan && (
        <Card className="border-violet-400/30 bg-violet-500/5">
          <CardContent className="flex flex-col items-center gap-4 p-6">
            <Button
              size="lg"
              className="bg-violet-500 text-white hover:bg-violet-400"
              disabled={!canGenerate}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Synthèse en cours (CPU, ça peut prendre du temps)…
                </>
              ) : (
                <>
                  <AudioLines className="mr-2 h-5 w-5" /> 3. Générer l&apos;audio
                </>
              )}
            </Button>
            {generateMutation.isError && (
              <p className="text-xs text-red-400">Erreur : {(generateMutation.error as Error).message}</p>
            )}
            {audioUrl && (
              <div className="w-full space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Wand2 className="h-3.5 w-3.5 text-violet-400" /> Voix générée
                  </span>
                  {audioDuration != null && <span>{audioDuration.toFixed(1)}s</span>}
                </div>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls src={audioUrl} className="w-full" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
