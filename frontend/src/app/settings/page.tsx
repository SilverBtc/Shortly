"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, ServerCog, Tags, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { SettingsPayload } from "@/lib/api-contract";
import { useStore } from "@/lib/store";

const WHISPER_MODELS = ["base", "small", "medium"];
const DEVICES = ["cpu", "cuda"];

const EMPTY: SettingsPayload = {
  llm_base_url: "http://localhost:11434/v1",
  llm_api_key: "",
  llm_model: "",
  tts_voice: "",
  tts_rate: "+0%",
  tts_pitch: "+0Hz",
  whisper_model: "base",
  whisper_device: "cpu",
  discord_webhook_url: "",
};

export default function SettingsPage() {
  const { settings, loadSettings } = useStore();
  const qc = useQueryClient();
  const [form, setForm] = React.useState<SettingsPayload>(EMPTY);
  const [saved, setSaved] = React.useState(false);

  // --- Niches (liste dynamique) ---
  const [nicheList, setNicheList] = React.useState<string[]>([]);
  const [nicheInput, setNicheInput] = React.useState("");
  const [nichesSaved, setNichesSaved] = React.useState(false);

  React.useEffect(() => {
    api
      .getNiches()
      .then((res) => setNicheList(res.niches))
      .catch((err) => console.error("getNiches", err));
  }, []);

  const addNiche = () => {
    const value = nicheInput.trim();
    if (!value || nicheList.length >= 20) return;
    if (nicheList.some((n) => n.toLowerCase() === value.toLowerCase())) return;
    setNicheList((l) => [...l, value]);
    setNicheInput("");
  };

  const removeNiche = (name: string) => setNicheList((l) => l.filter((n) => n !== name));

  const saveNiches = async () => {
    if (nicheList.length === 0) return;
    await api.updateNiches(nicheList);
    setNichesSaved(true);
    setTimeout(() => setNichesSaved(false), 2000);
    qc.invalidateQueries({ queryKey: ["niches"] });
  };

  React.useEffect(() => {
    if (!settings) loadSettings();
  }, [settings, loadSettings]);

  // Voix Shortly (backend/data/voices/ — daemon Qwen TTS)
  const [shortlyVoices, setShortlyVoices] = React.useState<string[]>([]);
  React.useEffect(() => {
    api
      .wizardVoices()
      .then((resp) => setShortlyVoices(resp.items.map((v) => `shortly:${v.name}`)))
      .catch(() => setShortlyVoices([]));
  }, []);

  React.useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const set = <K extends keyof SettingsPayload>(key: K, value: SettingsPayload[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    await useStore.getState().saveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Configuration système</h1>
          <p className="text-sm text-zinc-500">LLM, voix Shortly (Qwen TTS), Whisper et notifications Discord.</p>
        </div>
        <Button onClick={save} disabled={!settings}>
          {saved ? "✓ Sauvegardé" : (
            <>
              <Save className="h-4 w-4" /> Sauvegarder
            </>
          )}
        </Button>
      </div>

      {!settings ? (
        <div className="flex items-center gap-2 py-10 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des réglages…
        </div>
      ) : (
        <>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-zinc-300">
                <ServerCog className="h-4 w-4 text-amber-400" /> LLM (client OpenAI-compatible)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-zinc-400">Endpoint URL</Label>
                <Input
                  placeholder="https://api.openai.com/v1 ou http://localhost:11434/v1"
                  value={form.llm_base_url}
                  onChange={(e) => set("llm_base_url", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Identifiant du modèle</Label>
                <Input
                  placeholder="gpt-4o-mini / qwen2.5:7b"
                  value={form.llm_model}
                  onChange={(e) => set("llm_model", e.target.value)}
                />
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label className="text-xs text-zinc-400">Clé API</Label>
                <Input
                  type="password"
                  placeholder="sk-… (laisser vide pour Ollama local)"
                  value={form.llm_api_key}
                  onChange={(e) => set("llm_api_key", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-sm text-zinc-300">Voix — Shortly (backend/data/voices/, daemon Qwen TTS)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-4 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-zinc-400">Voix de narration</Label>
                <Select value={form.tts_voice} onValueChange={(v) => set("tts_voice", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Voix par défaut du projet" />
                  </SelectTrigger>
                  <SelectContent>
                    {shortlyVoices.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                    {shortlyVoices.length === 0 && (
                      <SelectItem value="__none__" disabled>
                        Aucune voix dans backend/data/voices/
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Vitesse de base</Label>
                <Input value={form.tts_rate} onChange={(e) => set("tts_rate", e.target.value)} placeholder="+0%" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Pitch de base</Label>
                <Input value={form.tts_pitch} onChange={(e) => set("tts_pitch", e.target.value)} placeholder="+0Hz" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-sm text-zinc-300">Whisper — transcription locale</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Modèle</Label>
                <Select value={form.whisper_model} onValueChange={(v) => set("whisper_model", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WHISPER_MODELS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m} {m === "small" ? "(recommandé)" : m === "medium" ? "(lent CPU)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Device</Label>
                <Select value={form.whisper_device} onValueChange={(v) => set("whisper_device", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-sm text-zinc-300">Discord — notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">URL du webhook</Label>
                <Input
                  placeholder="https://discord.com/api/webhooks/…"
                  value={form.discord_webhook_url}
                  onChange={(e) => set("discord_webhook_url", e.target.value)}
                />
                <p className="text-[11px] text-zinc-600">
                  Embed envoyé à la fin de chaque rendu : titre, niche, durée, statut, lien MP4.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-zinc-300">
                <Tags className="h-4 w-4 text-amber-400" /> Niches disponibles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {nicheList.map((n) => (
                  <Badge key={n} variant="outline" className="gap-1.5 py-1 pr-1 pl-3 text-zinc-200">
                    {n}
                    <button
                      type="button"
                      onClick={() => removeNiche(n)}
                      className="rounded-full p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                      title={`Retirer ${n}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {nicheList.length === 0 ? (
                  <span className="text-xs text-zinc-600">Aucune niche — ajoutez-en au moins une.</span>
                ) : null}
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs text-zinc-400">Ajouter une niche</Label>
                  <Input
                    placeholder="ex: Aviation / Pilotage, Jardinage, BTP…"
                    value={nicheInput}
                    onChange={(e) => setNicheInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addNiche();
                      }
                    }}
                  />
                </div>
                <Button variant="secondary" size="icon" onClick={addNiche} disabled={!nicheInput.trim() || nicheList.length >= 20}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={saveNiches} size="sm" disabled={nicheList.length === 0}>
                  {nichesSaved ? "✓ Sauvegardé" : "Sauvegarder les niches"}
                </Button>
                <span className="text-[11px] text-zinc-600">
                  {nicheList.length}/20 max — la liste se répercute dans /curation et /pipeline.
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
