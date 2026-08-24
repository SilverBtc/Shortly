"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Clapperboard, Copy, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as api from "@/lib/api";
import type { WordTimestamp } from "@/lib/api-contract";

export default function SpyPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [url, setUrl] = React.useState("");
  const [transcript, setTranscript] = React.useState<WordTimestamp[]>([]);
  const [text, setText] = React.useState("");
  const [scripts, setScripts] = React.useState<string[]>([]);
  const [copied, setCopied] = React.useState<number | null>(null);

  const analyze = useMutation({
    mutationFn: () => api.spyAnalyze(url),
    onSuccess: async ({ job_id }) => {
      const job = await api.pollJob(job_id, { timeoutMs: 300_000 });
      if (job.status === "failed") throw new Error(job.error ?? "Échec de l'analyse");
      const result = job.result as { transcript: WordTimestamp[]; text: string; scripts: string[] };
      setTranscript(result.transcript ?? []);
      setText(result.text ?? "");
      setScripts(result.scripts ?? []);
    },
  });

  const createFromScript = async (script: string) => {
    const { item } = await api.createProject({
      title: `Spy — ${new Date().toLocaleDateString("fr-FR")}`,
      script_raw: script,
    });
    qc.invalidateQueries({ queryKey: ["projects"] });
    router.push(`/pipeline?open=${item.id}`);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-black text-white">Veille concurrentielle & Re-Hook</h1>
        <p className="text-sm text-zinc-500">
          Collez l'URL d'une vidéo TikTok virale → transcription mot-à-mot → 3 scripts réécrits avec des accroches plus fortes.
        </p>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-zinc-400">URL TikTok du concurrent</Label>
              <Input
                placeholder="https://www.tiktok.com/@compte/video/1234567890"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <Button disabled={!url || analyze.isPending} onClick={() => analyze.mutate()}>
              {analyze.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              {analyze.isPending ? "Analyse en cours…" : "Analyser"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {analyze.isError ? (
        <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
          {analyze.error instanceof Error ? analyze.error.message : "Erreur inconnue"}
        </div>
      ) : null}

      {transcript.length > 0 ? (
        <div className="grid grid-cols-5 gap-4">
          <Card className="col-span-2 border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-sm text-zinc-300">Transcription mot-à-mot</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[420px] space-y-1 overflow-y-auto pr-2 text-sm">
              {text ? (
                <p className="mb-3 text-zinc-300">{text}</p>
              ) : null}
              {transcript.map((w, i) => (
                <div key={i} className="flex items-center gap-3 rounded px-2 py-0.5 text-xs hover:bg-zinc-800/60">
                  <span className="w-20 shrink-0 font-mono text-zinc-600">
                    {w.start.toFixed(2)}s
                  </span>
                  <span className="text-zinc-200">{w.word}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="col-span-3 space-y-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Sparkles className="h-4 w-4 text-amber-400" />
              3 variations de script générées par le LLM — prêtes à être réutilisées
            </div>
            {scripts.map((script, idx) => (
              <Card key={idx} className="border-zinc-800 bg-zinc-900/60">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">Variation {idx + 1}</Badge>
                    <span className="text-xs text-zinc-500">{script.split(/\s+/).length} mots</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await navigator.clipboard.writeText(script);
                        setCopied(idx);
                        setTimeout(() => setCopied(null), 1500);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> {copied === idx ? "Copié" : "Copier"}
                    </Button>
                    <Button size="sm" onClick={() => createFromScript(script)}>
                      Utiliser dans un projet
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{script}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
