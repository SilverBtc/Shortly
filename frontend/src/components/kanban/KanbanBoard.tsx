"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import type { VideoProject } from "@/lib/api-contract";
import { ProjectCard } from "./ProjectCard";

interface KanbanBoardProps {
  onOpenProject: (id: number) => void;
  onCreateProject: () => void;
}

const COLUMNS: Array<{ key: string; title: string; subtitle: string; accent: string }> = [
  { key: "draft", title: "Brouillons / Idées", subtitle: "script en cours", accent: "border-t-zinc-500" },
  { key: "ready", title: "À valider", subtitle: "prêt pour le rendu", accent: "border-t-amber-500" },
  { key: "rendering", title: "Rendu en cours", subtitle: "Remotion tourne", accent: "border-t-blue-500" },
  { key: "done", title: "Prêt / Notifié", subtitle: "MP4 + Discord", accent: "border-t-emerald-500" },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ onOpenProject, onCreateProject }) => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.updateProject(id, { status } as Partial<VideoProject>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
  const remove = useMutation({
    mutationFn: api.deleteProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const items = data?.items ?? [];

  const group = (key: string) => {
    if (key === "done") return items.filter((p) => p.status === "completed" || p.status === "failed");
    return items.filter((p) => p.status === key);
  };

  return (
    <div className="grid grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const columnItems = group(col.key);
        return (
          <div key={col.key} className={`flex flex-col rounded-xl border border-zinc-800 border-t-4 bg-zinc-950/50 ${col.accent}`}>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-bold text-white">{col.title}</div>
                <div className="text-[10px] text-zinc-600">{col.subtitle}</div>
              </div>
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-300">
                {columnItems.length}
              </span>
            </div>
            <div className="flex-1 space-y-3 p-3">
              {isLoading ? (
                <div className="py-6 text-center text-xs text-zinc-600">Chargement…</div>
              ) : columnItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 py-6 text-center text-xs text-zinc-700">
                  Vide
                </div>
              ) : (
                columnItems.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onOpen={onOpenProject}
                    onMove={(id, status) => move.mutate({ id, status })}
                    onDelete={(id) => {
                      if (confirm(`Supprimer le projet « ${p.title} » ?`)) remove.mutate(id);
                    }}
                  />
                ))
              )}
            </div>
            {col.key === "draft" ? (
              <div className="p-3">
                <Button variant="outline" className="w-full border-dashed" onClick={onCreateProject}>
                  <Plus className="h-4 w-4" /> Nouveau projet
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
