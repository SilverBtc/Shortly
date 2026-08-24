"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, Loader2, RefreshCw, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/api";
import { useNiches } from "@/lib/use-niches";
import { formatDuration } from "@/lib/utils";

export default function CurationPage() {
  const qc = useQueryClient();
  const { data: niches } = useNiches();
  const nicheOptions = niches ?? [];
  const [sourceType, setSourceType] = React.useState<"profile" | "hashtag" | "url">("profile");
  const [query, setQuery] = React.useState("");
  const [niche, setNiche] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [nicheFilter, setNicheFilter] = React.useState("");
  const [preview, setPreview] = React.useState<string | null>(null);
  const [pollingJob, setPollingJob] = React.useState(false);
  const [scrapeError, setScrapeError] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["assets", statusFilter, nicheFilter],
    queryFn: () => api.listAssets({ status: statusFilter || undefined, niche: nicheFilter || undefined }),
  });

  const approve = useMutation({
    mutationFn: api.approveAsset,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });
  const reject = useMutation({
    mutationFn: api.rejectAsset,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });
  const scrape = useMutation({
    mutationFn: () =>
      api.scrapeAssets({ source_type: sourceType, query, limit: 8, niche: niche || undefined }),
    onSuccess: async ({ job_id }) => {
      setPollingJob(true);
      setScrapeError(null);
      try {
        const job = await api.pollJob(job_id, { timeoutMs: 240_000 });
        if (job.status === "failed") {
          setScrapeError(job.error ?? "Échec du scraping (cause inconnue)");
        }
      } catch (err) {
        setScrapeError(err instanceof Error ? err.message : "Erreur pendant le scraping");
      } finally {
        setPollingJob(false);
        qc.invalidateQueries({ queryKey: ["assets"] });
      }
    },
  });

  const assets = data?.items ?? [];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-black text-white">Curation</h1>
        <p className="text-sm text-zinc-500">
          Sourcing TikTok — scrappez des rushs bruts, validez ceux sans sous-titres incrustés.
        </p>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5">
          <div className="grid grid-cols-12 items-end gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs text-zinc-400">Source</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as typeof sourceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profile">Profil</SelectItem>
                  <SelectItem value="hashtag">Hashtag</SelectItem>
                  <SelectItem value="url">URL directe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-4 space-y-1.5">
              <Label className="text-xs text-zinc-400">
                {sourceType === "profile" ? "Nom d'utilisateur" : sourceType === "hashtag" ? "Hashtag" : "URL TikTok"}
              </Label>
              <Input
                placeholder={
                  sourceType === "profile"
                    ? "ex: @cuisine.rapide"
                    : sourceType === "hashtag"
                    ? "ex: nettoyage"
                    : "https://www.tiktok.com/@x/video/123"
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs text-zinc-400">Niche (tagging)</Label>
              <Select value={niche} onValueChange={setNiche}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {nicheOptions.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-end gap-2">
              <Button
                disabled={!query || scrape.isPending || pollingJob}
                onClick={() => scrape.mutate()}
                className="w-full"
              >
                {scrape.isPending || pollingJob ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {pollingJob ? "Scraping…" : "Scraper"}
              </Button>
            </div>
            <div className="col-span-2 flex items-end gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStatusFilter("");
                  setNicheFilter("");
                  qc.invalidateQueries({ queryKey: ["assets"] });
                }}
              >
                <RefreshCw className="h-4 w-4" /> Reset
              </Button>
            </div>
          </div>

          <div className="mt-4 flex gap-3 border-t border-zinc-800 pt-4">
            <div className="w-44">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Statut : tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="approved">Approuvés</SelectItem>
                  <SelectItem value="rejected">Rejetés</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select value={nicheFilter} onValueChange={setNicheFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Niche : toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Toutes</SelectItem>
                  {nicheOptions.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {scrapeError ? (
        <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
          <span className="font-bold">Scraping en échec :</span> {scrapeError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center text-sm text-zinc-600">
          Aucun rush — lancez un scraping pour commencer.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {assets.map((a) => (
            <Card key={a.id} className="group overflow-hidden border-zinc-800 bg-zinc-900/60">
              <div className="relative aspect-[9/16] w-full cursor-pointer bg-black" onClick={() => setPreview(a.file_path)}>
                {a.thumbnail_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={api.mediaUrl(a.thumbnail_path)}
                    alt={a.title ?? "rush"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-700">
                    <Eye className="h-8 w-8" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
                  <Eye className="h-8 w-8 text-white" />
                </div>
                {a.duration ? (
                  <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {formatDuration(a.duration)}
                  </div>
                ) : null}
                <div className="absolute left-2 top-2">
                  <Badge
                    variant={
                      a.status === "approved" ? "success" : a.status === "rejected" ? "destructive" : "secondary"
                    }
                  >
                    {a.status === "approved" ? "Approuvé" : a.status === "rejected" ? "Rejeté" : "En attente"}
                  </Badge>
                </div>
              </div>
              <CardContent className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-zinc-300">{a.title ?? "Rush sans titre"}</div>
                  <div className="text-[10px] text-zinc-600">{a.niche ?? "non tagué"}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 border-emerald-700 text-emerald-400 hover:bg-emerald-950"
                    disabled={a.status === "approved" || approve.isPending}
                    onClick={() => approve.mutate(a.id)}
                    title="Approuver"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 border-red-700 text-red-400 hover:bg-red-950"
                    disabled={a.status === "rejected" || reject.isPending}
                    onClick={() => reject.mutate(a.id)}
                    title="Rejeter"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-sm border-zinc-800 bg-zinc-950">
          <DialogHeader>
            <DialogTitle>Vérification rapide du rush</DialogTitle>
            <DialogDescription>Vérifiez l'absence de sous-titres incrustés ou d'éléments parasites.</DialogDescription>
          </DialogHeader>
          {preview ? (
            <video src={api.mediaUrl(preview)} controls autoPlay className="aspect-[9/16] w-full rounded-lg bg-black" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
