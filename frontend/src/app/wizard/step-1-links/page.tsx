"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Link2, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { wizardFetchLinks, storageUrl } from "@/lib/api";
import { useWizardStore } from "@/lib/wizard-store";
import type { WizardLinkItem } from "@/lib/api-contract";

const PLACEHOLDER = "https://www.tiktok.com/@user/video/1234567890";
const PLACEHOLDER_YT = "https://www.youtube.com/shorts/abcdefghijk";

function isSupportedUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    return (
      host === "tiktok.com" ||
      host.endsWith(".tiktok.com") ||
      host === "youtube.com" ||
      host === "youtu.be" ||
      host === "m.youtube.com" ||
      host.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

export default function Step1LinksPage() {
  const router = useRouter();
  const { links, setLinks } = useWizardStore();

  // Nouveau projet : on oublie tout rendu précédent (évite le polling 404
  // d'un job mort resté dans le store persisté)
  React.useEffect(() => {
    useWizardStore.getState().setRenderResult(null, null);
  }, []);
  const [urls, setUrls] = React.useState<string[]>([""]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const validUrls = urls.map((u) => u.trim()).filter(Boolean);
  const hasInvalid = validUrls.some((u) => !isSupportedUrl(u));
  const canSubmit = validUrls.length > 0 && !hasInvalid && !loading;

  const addField = () => setUrls((prev) => [...prev, ""]);
  const removeField = (i: number) => setUrls((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  const updateField = (i: number, value: string) =>
    setUrls((prev) => prev.map((v, idx) => (idx === i ? value : v)));

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await wizardFetchLinks(validUrls);
      setLinks(resp.items);
      router.push("/wizard/step-2-hook");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-amber-400" /> Collez vos liens sources
          </CardTitle>
          <CardDescription>
            TikTok ou YouTube Shorts — 2 à 3 liens ciblés suffisent. Les vidéos sont téléchargées
            localement avec leurs métadonnées (miniature, durée, vues, hashtags).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {urls.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={url}
                onChange={(e) => updateField(i, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (i === urls.length - 1 ? addField() : undefined)}
                placeholder={i === 0 ? PLACEHOLDER : PLACEHOLDER_YT}
                className="bg-zinc-900"
                disabled={loading}
              />
              {url.trim() && !isSupportedUrl(url.trim()) && (
                <span title="URL non supportée (TikTok / YouTube Shorts uniquement)">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeField(i)}
                disabled={loading || urls.length <= 1}
                className="text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button variant="outline" onClick={addField} disabled={loading} className="w-full border-dashed">
            <Plus className="mr-2 h-4 w-4" /> Ajouter un nouveau lien
          </Button>

          {hasInvalid && (
            <p className="text-xs text-red-400">
              Certaines URLs ne sont pas supportées : TikTok ou YouTube Shorts uniquement.
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>
          )}

          <Button onClick={submit} disabled={!canSubmit} className="w-full bg-amber-400 text-black hover:bg-amber-300">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Téléchargement des vidéos…
              </>
            ) : (
              <>
                Importer les liens <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {links.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liens déjà importés ({links.length})</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {links.map((item: WizardLinkItem) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
                {item.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={storageUrl(item.thumbnail)} alt="" className="h-16 w-9 rounded object-cover" />
                ) : (
                  <div className="flex h-16 w-9 items-center justify-center rounded bg-zinc-800 text-[10px] text-zinc-600">
                    {item.status.startsWith("error") ? "✗" : "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-zinc-200">
                    {item.title ?? item.url.replace(/^https?:\/\//, "")}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    {item.duration ? `${Math.round(item.duration)}s` : "—"} ·{" "}
                    {item.view_count ? `${new Intl.NumberFormat("fr-FR").format(item.view_count)} vues` : "— vues"}
                  </p>
                  {item.status.startsWith("error") && (
                    <p className="mt-0.5 truncate text-[10px] text-red-400">{item.status}</p>
                  )}
                </div>
                <Badge variant="secondary" className="text-[9px]">
                  {item.status.startsWith("error") ? "échec" : "prêt"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Annuler
        </Link>
        {links.length > 0 && (
          <Link href="/wizard/step-2-hook" className="text-xs font-semibold text-amber-400 hover:text-amber-300">
            Étape 2 : Choisir le Hook →
          </Link>
        )}
      </div>
    </div>
  );
}
