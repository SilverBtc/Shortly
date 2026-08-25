"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Eye, Magnet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { storageUrl } from "@/lib/api";
import { useWizardStore } from "@/lib/wizard-store";
import { cn } from "@/lib/utils";

export default function Step2HookPage() {
  const router = useRouter();
  const { links, hookId, setHook } = useWizardStore();

  // Réutilisation de vidéos déjà importées : on oublie aussi le rendu
  // précédent pour repartir proprement
  React.useEffect(() => {
    useWizardStore.getState().setRenderResult(null, null);
  }, []);

  const readyLinks = links.filter((l) => !l.status.startsWith("error"));
  const selected = links.find((l) => l.id === hookId) ?? null;

  const confirm = () => {
    if (selected) router.push("/wizard/step-3-settings");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Magnet className="h-4 w-4 text-amber-400" /> Choisissez le Hook
          </CardTitle>
          <CardDescription>
            Les <strong>3 premières secondes</strong> décident du watchtime. Cliquez sur la vidéo
            dont l'ouverture est la plus percutante — elle sera montée en premier, coupée à l'essentiel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {readyLinks.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 p-6 text-center text-sm text-zinc-500">
              Aucune vidéo importée —{" "}
              <Link href="/wizard/step-1-links" className="text-amber-400 hover:underline">
                revenez à l'étape 1
              </Link>
              .
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {readyLinks.map((item) => {
                const isSelected = item.id === hookId;
                return (
                  <button
                    key={item.id}
                    onClick={() => setHook(item.id)}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border text-left transition-all",
                      isSelected
                        ? "border-amber-400 ring-2 ring-amber-400/50"
                        : "border-zinc-800 hover:border-zinc-600"
                    )}
                  >
                    <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
                      {item.video ? (
                        <video
                          src={storageUrl(item.video)}
                          poster={storageUrl(item.thumbnail)}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover"
                          onMouseEnter={(e) => {
                            const v = e.currentTarget;
                            v.currentTime = 0;
                            void v.play().catch(() => undefined);
                          }}
                          onMouseLeave={(e) => e.currentTarget.pause()}
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={storageUrl(item.thumbnail)}
                          alt={item.title ?? "vidéo"}
                          className="h-full w-full object-cover"
                        />
                      )}
                      {isSelected && (
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-black">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 p-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-200">{item.title ?? "Sans titre"}</p>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                        {item.duration ? <span>{Math.round(item.duration)}s</span> : null}
                        {item.view_count ? (
                          <span className="flex items-center gap-0.5">
                            <Eye className="h-3 w-3" />
                            {new Intl.NumberFormat("fr-FR", { notation: "compact" }).format(item.view_count)}
                          </span>
                        ) : null}
                      </div>
                      {item.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.hashtags.slice(0, 3).map((h) => (
                            <Badge key={h} variant="outline" className="px-1 text-[8px]">
                              {h}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Link
          href="/wizard/step-1-links"
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Link>
        <Button
          onClick={confirm}
          disabled={!selected}
          className="bg-amber-400 text-black hover:bg-amber-300"
        >
          Choisir ce début <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
