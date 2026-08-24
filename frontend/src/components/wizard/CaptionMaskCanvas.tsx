"use client";

import * as React from "react";
import { Grip, Scan } from "lucide-react";
import { storageUrl } from "@/lib/api";
import { DEFAULT_MASK, useWizardStore } from "@/lib/wizard-store";
import type { WizardMaskArea } from "@/lib/api-contract";
import { Button } from "@/components/ui/button";

const MIN_W = 8;
const MIN_H = 6;

/**
 * Outil Caption Mask : rectangle interactif (déplacement + redimensionnement en %)
 * posé sur la prévisualisation 9:16 pour masquer le texte incrusté natif.
 * La zone est floutée au rendu (backdrop-filter) et/ou recouverte par les sous-titres.
 */
export function CaptionMaskCanvas() {
  const { links, mask, setMask } = useWizardStore();
  const previewLink = links.find((l) => !l.status.startsWith("error")) ?? links[0];

  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ mode: "move" | "resize"; startX: number; startY: number; orig: WizardMaskArea } | null>(null);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const onPointerDown = (e: React.PointerEvent, mode: "move" | "resize") => {
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...mask } };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const el = containerRef.current;
    if (!drag || !el) return;
    const rect = el.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;
    const o = drag.orig;

    if (drag.mode === "move") {
      setMask({
        ...mask,
        x: clamp(o.x + dxPct, 0, 100 - o.width),
        y: clamp(o.y + dyPct, 0, 100 - o.height),
      });
    } else {
      setMask({
        ...mask,
        width: clamp(o.width + dxPct, MIN_W, 100 - o.x),
        height: clamp(o.height + dyPct, MIN_H, 100 - o.y),
      });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <Scan className="h-3.5 w-3.5 text-amber-400" /> Zone à masquer
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMask({ ...DEFAULT_MASK, enabled: true })}
          className="h-7 text-[10px]"
        >
          Réinitialiser
        </Button>
      </div>

      <div
        ref={containerRef}
        className="relative mx-auto aspect-[9/16] w-full max-w-[260px] touch-none select-none overflow-hidden rounded-lg border border-zinc-800 bg-black"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {previewLink?.video ? (
          <video
            src={storageUrl(previewLink.video)}
            poster={storageUrl(previewLink.thumbnail)}
            muted
            loop
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={storageUrl(previewLink?.thumbnail)}
            alt="preview"
            className="h-full w-full object-cover"
          />
        )}

        {mask.enabled && (
          <div
            className="absolute cursor-move border-2 border-amber-400 bg-amber-400/10"
            style={{
              left: `${mask.x}%`,
              top: `${mask.y}%`,
              width: `${mask.width}%`,
              height: `${mask.height}%`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
            }}
            onPointerDown={(e) => onPointerDown(e, "move")}
          >
            <span className="absolute left-1 top-1 flex items-center gap-1 text-[9px] font-bold text-amber-300">
              <Grip className="h-3 w-3" /> MASQUE
            </span>
            {/* Poignée de redimensionnement */}
            <span
              className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-amber-400 bg-zinc-950"
              onPointerDown={(e) => onPointerDown(e, "resize")}
            />
          </div>
        )}
      </div>

      <div className="space-y-2 text-xs">
        <label className="flex items-center justify-between gap-3">
          <span className="text-zinc-400">Flou appliqué</span>
          <input
            type="range"
            min={0}
            max={40}
            value={mask.blurAmount}
            onChange={(e) => setMask({ ...mask, blurAmount: Number(e.target.value) })}
            className="w-40 accent-amber-400"
          />
          <span className="w-8 text-right font-mono text-zinc-300">{mask.blurAmount}px</span>
        </label>
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Astuce : positionnez le rectangle sur le texte incrusté natif. Au rendu, la zone sera
          floutée et vos sous-titres viendront la recouvrir.
        </p>
      </div>
    </div>
  );
}
