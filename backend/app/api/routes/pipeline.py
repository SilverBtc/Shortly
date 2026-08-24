"""Module 3 — Pipeline Kanban & Éditeur de projet."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.pydantic_schemas import ProjectAssetIn, ProjectCreate, ProjectDetailOut, ProjectUpdate
from app.models.sql_models import MediaAsset, ProjectAsset, VideoProject
from app.workers import task_queue

router = APIRouter(prefix="/projects", tags=["pipeline"])


async def _get_project_or_404(project_id: int, db: AsyncSession) -> VideoProject:
    project = await db.get(VideoProject, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    return project


def _detail(project: VideoProject) -> dict:
    return {
        "item": project.to_dict(),
        "assets": [pa.to_dict() for pa in project.assets],
    }


@router.get("", response_model=dict)
async def list_projects(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(VideoProject).order_by(VideoProject.updated_at.desc()))).scalars().all()
    return {"items": [p.to_dict() for p in rows]}


@router.post("", response_model=dict)
async def create_project(body: ProjectCreate, db: AsyncSession = Depends(get_db)) -> dict:
    project = VideoProject(
        title=body.title,
        banner_text=body.banner_text,
        niche=body.niche,
        script_raw=body.script_raw,
        voice_id=body.voice_id,
        subtitle_preset=body.subtitle_preset,
        status="draft",
    )
    db.add(project)
    await db.flush()

    for idx, link in enumerate(body.assets):
        asset = await db.get(MediaAsset, link.asset_id)
        if asset is None:
            raise HTTPException(status_code=404, detail=f"Asset {link.asset_id} introuvable")
        db.add(
            ProjectAsset(
                project_id=project.id,
                asset_id=link.asset_id,
                order_index=link.order_index if link.order_index else idx,
                is_hook=link.is_hook,
            )
        )
    await db.commit()
    await db.refresh(project)
    return {"item": project.to_dict()}


@router.get("/{project_id}", response_model=ProjectDetailOut)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    project = await _get_project_or_404(project_id, db)
    # refresh des relations (lazy joined)
    await db.refresh(project, attribute_names=["assets"])
    return _detail(project)


@router.patch("/{project_id}", response_model=dict)
async def update_project(
    project_id: int, body: ProjectUpdate, db: AsyncSession = Depends(get_db)
) -> dict:
    project = await _get_project_or_404(project_id, db)
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return {"item": project.to_dict()}


@router.delete("/{project_id}", response_model=dict)
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    project = await _get_project_or_404(project_id, db)
    await db.delete(project)
    await db.commit()
    return {"ok": True}


@router.post("/{project_id}/assets", response_model=dict)
async def add_project_asset(
    project_id: int, body: ProjectAssetIn, db: AsyncSession = Depends(get_db)
) -> dict:
    project = await _get_project_or_404(project_id, db)
    asset = await db.get(MediaAsset, body.asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset introuvable")
    if asset.status != "approved":
        raise HTTPException(status_code=400, detail="Seuls les rushs approuvés peuvent être utilisés")

    existing = await db.get(ProjectAsset, (project_id, body.asset_id))
    if existing is not None:
        raise HTTPException(status_code=400, detail="Cet asset est déjà lié au projet")

    next_order = body.order_index
    if next_order == 0:
        rows = (await db.execute(
            select(ProjectAsset.order_index).where(ProjectAsset.project_id == project_id)
        )).scalars().all()
        next_order = max(rows, default=-1) + 1

    link = ProjectAsset(
        project_id=project_id,
        asset_id=body.asset_id,
        order_index=next_order,
        is_hook=body.is_hook,
    )
    db.add(link)
    await db.commit()
    return {"item": link.to_dict()}


@router.delete("/{project_id}/assets/{asset_id}", response_model=dict)
async def remove_project_asset(
    project_id: int, asset_id: int, db: AsyncSession = Depends(get_db)
) -> dict:
    link = await db.get(ProjectAsset, (project_id, asset_id))
    if link is None:
        raise HTTPException(status_code=404, detail="Lien projet/asset introuvable")
    await db.delete(link)
    await db.commit()
    return {"ok": True}


@router.post("/{project_id}/prepare", response_model=dict)
async def prepare_project(project_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    """TTS + Whisper (préparation des médias pour la prévisualisation)."""
    await _get_project_or_404(project_id, db)
    job_id = task_queue.enqueue("prepare", {"project_id": project_id})
    return {"job_id": job_id}


@router.post("/{project_id}/render", response_model=dict)
async def render_project(project_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    """Lance le rendu Remotion complet."""
    project = await _get_project_or_404(project_id, db)
    if project.status == "rendering":
        raise HTTPException(status_code=409, detail="Un rendu est déjà en cours")
    job_id = task_queue.enqueue("render", {"project_id": project_id})
    return {"job_id": job_id}
