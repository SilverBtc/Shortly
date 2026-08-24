"""Module 1 — Sourcing & Curation : scraping TikTok, validation des rushs."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.pydantic_schemas import MediaAssetOut, ScrapeRequest
from app.models.sql_models import MediaAsset
from app.workers import task_queue

router = APIRouter(prefix="/curation", tags=["curation"])


@router.get("/assets", response_model=dict)
async def list_assets(
    status: str | None = None,
    niche: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Liste les rushs bruts (filtres status / niche)."""
    query = select(MediaAsset).order_by(MediaAsset.created_at.desc())
    if status:
        query = query.where(MediaAsset.status == status)
    if niche:
        query = query.where(MediaAsset.niche == niche)
    rows = (await db.execute(query)).scalars().all()
    return {"items": [a.to_dict() for a in rows]}


@router.post("/scrape", response_model=dict)
async def scrape(body: ScrapeRequest) -> dict:
    """Lance un scraping TikTok (profil / hashtag / URL) en tâche de fond."""
    job_id = task_queue.enqueue(
        "scrape",
        {
            "source_type": body.source_type,
            "query": body.query,
            "limit": body.limit,
            "niche": body.niche,
        },
    )
    return {"job_id": job_id}


@router.post("/assets/{asset_id}/approve", response_model=MediaAssetOut)
async def approve_asset(asset_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    asset = await db.get(MediaAsset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Rush introuvable")
    asset.status = "approved"
    await db.commit()
    await db.refresh(asset)
    return asset.to_dict()


@router.post("/assets/{asset_id}/reject", response_model=MediaAssetOut)
async def reject_asset(asset_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    asset = await db.get(MediaAsset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Rush introuvable")
    asset.status = "rejected"
    await db.commit()
    await db.refresh(asset)
    return asset.to_dict()
