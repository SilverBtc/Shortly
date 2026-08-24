"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Activity, CheckCircle2, Clock, Eye, Film, Loader2, Plus, Video, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import { formatDate } from "@/lib/utils";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }> = {
  draft: { label: "Brouillon", variant: "secondary" },
  ready: { label: "À valider", variant: "warning" },
  rendering: { label: "Rendu en cours", variant: "default" },
  completed: { label: "Prêt", variant: "success" },
  failed: { label: "Échec", variant: "destructive" },
};

export default function DashboardPage() {
  const { data: projects, isLoading } = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const { data: assets } = useQuery({ queryKey: ["assets-all"], queryFn: () => api.listAssets() });

  const items = projects?.items ?? [];
  const assetItems = assets?.items ?? [];
  const counts = {
    draft: items.filter((p) => p.status === "draft").length,
    ready: items.filter((p) => p.status === "ready").length,
    rendering: items.filter((p) => p.status === "rendering").length,
    completed: items.filter((p) => p.status === "completed").length,
    failed: items.filter((p) => p.status === "failed").length,
  };
  const approved = assetItems.filter((a) => a.status === "approved").length;
  const pending = assetItems.filter((a) => a.status === "pending").length;

  const stats = [
    { label: "Rushs approuvés", value: approved, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Rushs en attente", value: pending, icon: Eye, color: "text-amber-400" },
    { label: "Projets actifs", value: counts.draft + counts.ready + counts.rendering, icon: Activity, color: "text-blue-400" },
    { label: "Vidéos prêtes", value: counts.completed, icon: Video, color: "text-violet-400" },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Dashboard</h1>
          <p className="text-sm text-zinc-500">Production de vidéos courtes monétisables — 61 à 68 secondes</p>
        </div>
        <Link href="/wizard/step-1-links">
          <Button className="mr-2 border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20">
            <Wand2 className="h-4 w-4" /> Wizard 5 étapes
          </Button>
        </Link>
        <Link href="/pipeline">
          <Button>
            <Plus className="h-4 w-4" /> Nouveau projet
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-800 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-black text-white">{value}</div>
                <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 border-zinc-800 bg-zinc-900/60">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-zinc-300">Derniers projets</CardTitle>
            <Link href="/pipeline" className="text-xs text-amber-400 hover:underline">
              Voir le pipeline →
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && (
              <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </div>
            )}
            {!isLoading && items.length === 0 && (
              <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
                <Film className="h-4 w-4" /> Aucun projet — créez-en un dans le pipeline.
              </div>
            )}
            {items.slice(0, 6).map((p) => {
              const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.draft;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{p.title}</div>
                    <div className="text-xs text-zinc-500">
                      {p.niche ?? "—"} · {formatDate(p.updated_at)}
                    </div>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-sm text-zinc-300">Répartition des statuts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Brouillons / Idées", value: counts.draft, color: "bg-zinc-600" },
              { label: "À valider", value: counts.ready, color: "bg-amber-500" },
              { label: "Rendu en cours", value: counts.rendering, color: "bg-blue-500" },
              { label: "Prêt / Notifié", value: counts.completed, color: "bg-emerald-500" },
              { label: "Échec", value: counts.failed, color: "bg-red-500" },
            ].map(({ label, value, color }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">{label}</span>
                  <span className="font-bold text-white">{value}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${items.length ? Math.max(3, (value / items.length) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
              <Clock className="h-3.5 w-3.5" /> Rendu ~61-68s · 1080×1920 · 30 fps
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
