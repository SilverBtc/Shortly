"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, AudioLines, Captions, ChevronDown, Music, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useWizardStore } from "@/lib/wizard-store";
import { CaptionMaskCanvas } from "@/components/wizard/CaptionMaskCanvas";
import { CaptionSection, MusicSection, VoiceSection } from "@/components/wizard/WizardSections";

function Accordion({
  icon,
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Card>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-amber-400">
            {icon}
          </span>
          <span>
            <span className="block text-sm font-bold text-zinc-100">{title}</span>
            <span className="block text-[11px] text-zinc-500">{subtitle}</span>
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && <CardContent className="border-t border-zinc-800/70 px-5 py-4">{children}</CardContent>}
    </Card>
  );
}

export default function Step3SettingsPage() {
  const router = useRouter();
  const { links } = useWizardStore();

  if (links.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-800 p-8 text-center text-sm text-zinc-500">
        Aucune vidéo importée —{" "}
        <Link href="/wizard/step-1-links" className="text-amber-400 hover:underline">
          commencez par l'étape 1
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Voix : sélection seule (pré-écoute locale), TTS généré uniquement au rendu final */}
      <Accordion
        icon={<AudioLines className="h-4 w-4" />}
        title="Voix off"
        subtitle="Voix Shortly (daemon Qwen TTS) — pré-écoute locale, génération au rendu"
        defaultOpen
      >
        <VoiceSection />
      </Accordion>

      <Accordion
        icon={<Captions className="h-4 w-4" />}
        title="Sous-titres cinétiques"
        subtitle="Couleur du mot en cours — style TikTok officiel"
      >
        <CaptionSection />
      </Accordion>

      <Accordion
        icon={<Music className="h-4 w-4" />}
        title="Musique de fond"
        subtitle="Bibliothèque locale classée par catégorie — auto-ducking -22 dB"
      >
        <MusicSection />
      </Accordion>

      <Accordion
        icon={<Scan className="h-4 w-4" />}
        title="Outil Caption Mask"
        subtitle="Masquez le texte incrusté natif des vidéos sources (flou + recouvrement)"
      >
        <CaptionMaskCanvas />
      </Accordion>

      <div className="flex items-center justify-between pt-2">
        <Link
          href="/wizard/step-2-hook"
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Link>
        <Button
          onClick={() => router.push("/wizard/step-4-script")}
          className="bg-amber-400 text-black hover:bg-amber-300"
        >
          Écrire le script <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
