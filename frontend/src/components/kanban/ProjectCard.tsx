"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Film, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VideoProject } from "@/lib/api-contract";
import { formatDate } from "@/lib/utils";

export const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }
> = {
  draft: { label: "Brouillon", variant: "secondary" },
  ready: { label: "À valider", variant: "warning" },
  rendering: { label: "Rendu en cours", variant: "default" },
  completed: { label: "Prêt", variant: "success" },
  failed: { label: "Échec", variant: "destructive" },
};

const NEXT_STATUS: Record<string, string> = {
  draft: "ready",
  ready: "completed",
  completed: "completed",
  failed: "draft",
  rendering: "rendering",
};

interface ProjectCardProps {
  project: VideoProject;
  onOpen: (id: number) => void;
  onMove: (id: number, status: string) => void;
  onDelete: (id: number) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onOpen, onMove, onDelete }) => {
  const badge = STATUS_BADGE[project.status] ?? STATUS_BADGE.draft;
  const wordCount = project.script_raw ? project.script_raw.split(/\s+/).filter(Boolean).length : 0;
  const hasAudio = !!project.audio_path;
  const hasOutput = !!project.output_path;

  return (
    <div
      className="group cursor-pointer space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 transition-colors hover:border-zinc-600"
      onClick={() => onOpen(project.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">{project.title}</div>
          <div className="text-[10px] text-zinc-600">{project.niche ?? "sans niche"}</div>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span>{wordCount} mots</span>
        <span>·</span>
        <span>{hasAudio ? "🎙 audio prêt" : "🎙 sans audio"}</span>
        {hasOutput ? <span>· 🎬 MP4</span> : null}
      </div>

      <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
        <div className="text-[10px] text-zinc-700">{formatDate(project.updated_at)}</div>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {project.status === "rendering" ? null : (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              title="Avancer"
              disabled={NEXT_STATUS[project.status] === project.status}
              onClick={() => onMove(project.id, NEXT_STATUS[project.status] ?? "completed")}
            >
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="Revenir"
            disabled={project.status === "draft"}
            onClick={() => onMove(project.id, project.status === "completed" || project.status === "failed" ? "draft" : "draft")}
          >
            <ArrowLeft className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-red-400 hover:bg-red-950"
            title="Supprimer"
            onClick={() => onDelete(project.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {project.status === "failed" ? (
        <div className="rounded bg-red-950/50 px-2 py-1 text-[10px] text-red-300">
          Échec du rendu — ouvrez le projet pour les détails.
        </div>
      ) : null}
      {project.status === "rendering" ? (
        <div className="flex items-center gap-2 rounded bg-blue-950/50 px-2 py-1 text-[10px] text-blue-300">
          <Film className="h-3 w-3 animate-pulse" /> Rendu Remotion en cours…
        </div>
      ) : null}
    </div>
  );
};
