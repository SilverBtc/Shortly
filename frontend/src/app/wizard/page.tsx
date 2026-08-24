"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Link2,
  Magnet,
  Music2,
  Scan,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  {
    icon: Link2,
    title: "1. Liens sources",
    desc: "Collez 2-3 liens TikTok / YouTube Shorts — les vidéos et leurs métadonnées (vues, hashtags) sont importées localement.",
  },
  {
    icon: Magnet,
    title: "2. Hook",
    desc: "Choisissez en 1 clic la vidéo dont l'ouverture sera montée en premier — les 3 premières secondes qui font le watchtime.",
  },
  {
    icon: SlidersHorizontal,
    title: "3. Audio & sous-titres",
    desc: "Voix IA française avec pré-écoute, sous-titres cinétiques (mot-à-mot ou phrase), musique en auto-ducking et Caption Mask.",
  },
  {
    icon: Sparkles,
    title: "4. Script IA",
    desc: "Générez un script viral balisé depuis vos idées brutes, ou récupérez-le depuis une vidéo concurrente (Whisper + LLM).",
  },
  {
    icon: Wand2,
    title: "5. Rendu",
    desc: "Prévisualisation temps réel, rendu serveur 1080×1920 et notification Discord automatique dès que le MP4 est prêt.",
  },
];

export default function WizardHomePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Héro */}
      <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/10 via-zinc-900 to-zinc-950 p-8">
        <div className="flex items-center gap-2 text-amber-400">
          <Wand2 className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">Tunnel de création</span>
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
          De 3 liens à une vidéo <span className="text-amber-400">monétisable</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Fini le scraping aléatoire : collez des vidéos ciblées, choisissez le hook, réglez la voix
          et les sous-titres, générez le script viral et lancez le rendu. Le tout en 5 étapes guidées.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/wizard/step-1-links">
            <Button className="bg-amber-400 text-black hover:bg-amber-300">
              Commencer <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="/pipeline">
            <Button variant="outline">Voir le pipeline</Button>
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
          <span className="rounded bg-zinc-800 px-2 py-0.5">🎙️ Voix Shortly (Qwen TTS)</span>
          <span className="rounded bg-zinc-800 px-2 py-0.5">💬 Sous-titres cinétiques</span>
          <span className="rounded bg-zinc-800 px-2 py-0.5">🎵 Auto-ducking -22 dB</span>
          <span className="rounded bg-zinc-800 px-2 py-0.5">🎭 Caption Mask</span>
          <span className="rounded bg-zinc-800 px-2 py-0.5">🤖 Script IA 61-66 s</span>
        </div>
      </div>

      {/* Les 5 étapes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="border-zinc-800 bg-zinc-900/60 transition-colors hover:border-zinc-700">
            <CardHeader>
              <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-amber-400">
                <Icon className="h-5 w-5" />
              </span>
              <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs leading-relaxed text-zinc-500">{desc}</CardDescription>
            </CardContent>
          </Card>
        ))}
        <Card className="border-dashed border-amber-400/40 bg-amber-400/5">
          <CardContent className="flex h-full min-h-[140px] flex-col items-center justify-center gap-3 text-center">
            <Music2 className="h-6 w-6 text-amber-400" />
            <p className="text-xs text-zinc-400">
              Déposez vos musiques libres dans <code className="rounded bg-zinc-800 px-1">backend/data/music/</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
