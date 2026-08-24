"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ProjectEditorDialog } from "@/components/kanban/ProjectEditorDialog";

function PipelineInner() {
  const searchParams = useSearchParams();
  const openParam = searchParams.get("open");
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (openParam) {
      const id = Number(openParam);
      if (!Number.isNaN(id)) setEditingId(id);
    }
  }, [openParam]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-black text-white">Pipeline Kanban</h1>
        <p className="text-sm text-zinc-500">
          Brouillons / Idées → À valider → Rendu en cours → Prêt / Notifié.
        </p>
      </div>

      <KanbanBoard
        onOpenProject={(id) => setEditingId(id)}
        onCreateProject={() => setCreating(true)}
      />

      <ProjectEditorDialog
        projectId={editingId}
        open={editingId !== null}
        onClose={() => setEditingId(null)}
      />
      <ProjectEditorDialog
        projectId={null}
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => setCreating(false)}
      />
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="py-12 text-sm text-zinc-600">Chargement…</div>}>
      <PipelineInner />
    </Suspense>
  );
}
