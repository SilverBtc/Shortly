"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Link2, Magnet, SlidersHorizontal, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { href: "/wizard/step-1-links", label: "Liens sources", icon: Link2 },
  { href: "/wizard/step-2-hook", label: "Hook", icon: Magnet },
  { href: "/wizard/step-3-settings", label: "Audio & sous-titres", icon: SlidersHorizontal },
  { href: "/wizard/step-4-script", label: "Script IA", icon: Sparkles },
  { href: "/wizard/step-5-render", label: "Rendu", icon: Wand2 },
];

export default function WizardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentIndex = Math.max(
    0,
    STEPS.findIndex((s) => pathname.startsWith(s.href))
  );

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white">
            Tunnel de création <span className="text-amber-400">Wizard</span>
          </h1>
          <p className="text-sm text-zinc-500">
            De 2-3 liens TikTok / YouTube Shorts à une vidéo 9:16 monétisable en 5 étapes.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          ← Retour au dashboard
        </Link>
      </div>

      {/* Stepper */}
      <ol className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={step.href} className="flex flex-1 items-center gap-1">
              <Link
                href={step.href}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold transition-colors",
                  active && "bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/40",
                  done && "text-emerald-400 hover:bg-zinc-800",
                  !active && !done && "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-[11px]",
                    active && "bg-amber-400 text-black",
                    done && "bg-emerald-500/20",
                    !active && !done && "bg-zinc-800 text-zinc-500"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <Icon className="hidden h-3.5 w-3.5 sm:block" />
                <span className="hidden md:inline">{step.label}</span>
              </Link>
              {i < STEPS.length - 1 && <div className="h-px w-2 bg-zinc-800" />}
            </li>
          );
        })}
      </ol>

      {children}
    </div>
  );
}
