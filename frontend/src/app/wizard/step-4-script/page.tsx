"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getJob, wizardFetchConcurrent, wizardGenerateScript, wizardOptimizeScript } from "@/lib/api";
import { useWizardStore } from "@/lib/wizard-store";
import type { JobStatus } from "@/lib/api-contract";
import { cn } from "@/lib/utils";

/* Retire les balises pour compter les mots réellement parlés */
const stripTags = (s: string) => s.replace(/\[(?:pause|rapide|insistance|grave|chuchotement)[^\]]*\]|\[\/(?:rapide|insistance|grave|chuchotement)\]/gi, "");
const countWords = (s: string) => (stripTags(s).trim() ? stripTags(s).trim().split(/\s+/).length : 0);
/* ~2.35 mots/seconde à l'oral (mesure TTS fr) */
const estimateSeconds = (s: string) => countWords(s) / 2.35;

const TAG_PATTERN = /(\[pause\]|\[rapide\]|\[insistance\]|\[grave\]|\[\/(?:rapide|insistance|grave)\])/g;
const TAG_COLORS: Record<string, string> = {
  "[pause]": "#fbbf24",
  "[rapide]": "#f87171",
  "[/rapide]": "#f87171",
  "[insistance]": "#a78bfa",
  "[/insistance]": "#a78bfa",
  "[grave]": "#60a5fa",
  "[/grave]": "#60a5fa",
};

function ScriptPreview({ text }: { text: string }) {
  const parts = text.split(TAG_PATTERN);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
      {parts.map((part, i) =>
        TAG_COLORS[part] ? (
          <mark key={i} className="rounded bg-zinc-800 px-1 text-[11px]" style={{ color: TAG_COLORS[part] }}>
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </p>
  );
}

export default function Step4ScriptPage() {
  const router = useRouter();
  const { script, setScript, voiceId } = useWizardStore();

  const [idea, setIdea] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [optimizing, setOptimizing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Option B : récupération script concurrent
  const [concurrentUrl, setConcurrentUrl] = React.useState("");
  const [spyJobId, setSpyJobId] = React.useState<string | null>(null);
  const [variations, setVariations] = React.useState<string[]>([]);
  const [spyError, setSpyError] = React.useState<string | null>(null);

  const words = countWords(script);
  const seconds = estimateSeconds(script);
  const inTarget = seconds >= 58 && seconds <= 68;

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

  const generate = async () => {
    if (!idea.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const resp = await wizardGenerateScript(idea);
      setScript(resp.script);
      setVariations([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur génération");
    } finally {
      setGenerating(false);
    }
  };

  const optimize = async () => {
    if (!script.trim()) return;
    setOptimizing(true);
    setError(null);
    try {
      const resp = await wizardOptimizeScript(script);
      setScript(resp.script);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur optimisation");
    } finally {
      setOptimizing(false);
    }
  };

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
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Option A — génération IA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-amber-400" /> Génération IA depuis vos idées
          </CardTitle>
          <CardDescription>
            Décrivez vos idées ou ce que vous voulez raconter — le LLM produit un storytelling 1ère
            personne balisé, calibré pour 61-66 s.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Ex : Panne moteur simulée à 3 000 pieds en Cessna 172, instructeur qui coupe les gaz sans prévenir, stress, procédure d'atterrissage d'urgence dans un champ, dénouement réussi"
            className="min-h-[110px] bg-zinc-900"
          />
          <Button onClick={generate} disabled={generating || idea.trim().length < 3} className="bg-amber-400 text-black hover:bg-amber-300">
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Génération en cours…
              </>
            ) : (
              <>✨ Générer le script viral</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Option B — récupération concurrente */}
      <Card>
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
                    Variation {i + 1} — cliquer pour l'utiliser
                  </span>
                  {v.slice(0, 160)}…
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Éditeur de script */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-amber-400" /> Éditeur de script
          </CardTitle>
          <CardDescription>
            Éditez librement — les balises <code className="rounded bg-zinc-800 px-1 text-[10px]">[pause]</code>,{" "}
            <code className="rounded bg-zinc-800 px-1 text-[10px]">[rapide]</code>,{" "}
            <code className="rounded bg-zinc-800 px-1 text-[10px]">[insistance]</code>,{" "}
            <code className="rounded bg-zinc-800 px-1 text-[10px]">[grave]</code> donnent vie à la voix.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Votre script viral balisé apparaîtra ici…"
            className="min-h-[180px] bg-zinc-900 font-mono text-sm"
          />

          {/* Compteurs dynamiques */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <p className="text-lg font-black text-zinc-100">{script.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Caractères</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <p className={cn("text-lg font-black", words >= 135 && words <= 155 ? "text-emerald-400" : "text-zinc-100")}>
                {words}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Mots (135-155)</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
              <p className={cn("text-lg font-black", inTarget ? "text-emerald-400" : "text-amber-400")}>
                {seconds.toFixed(1)}s
              </p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Durée estimée</p>
            </div>
          </div>

          {script && (
            <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/60 p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Aperçu balisé</p>
              <ScriptPreview text={script} />
            </div>
          )}

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" onClick={optimize} disabled={optimizing || !script.trim()}>
              {optimizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4 text-amber-400" />}
              Optimiser le script (61-65 s)
            </Button>
            <Button onClick={() => router.push("/wizard/step-5-render")} disabled={!script.trim()} className="bg-amber-400 text-black hover:bg-amber-300">
              Générer la vidéo <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Link href="/wizard/step-3-settings" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Link>
      </div>
    </div>
  );
}
