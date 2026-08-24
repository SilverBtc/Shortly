"""Module 2 — Veille Concurrentielle & Re-Hook : URL TikTok -> transcript -> 3 scripts."""
from __future__ import annotations

from fastapi import APIRouter

from app.models.pydantic_schemas import SpyRequest
from app.workers import task_queue

router = APIRouter(prefix="/spy", tags=["spy"])


@router.post("/analyze", response_model=dict)
async def analyze(body: SpyRequest) -> dict:
    """Lance l'analyse d'une vidéo concurrente (audio -> whisper -> LLM 3 variations)."""
    job_id = task_queue.enqueue("spy", {"tiktok_url": str(body.tiktok_url)})
    return {"job_id": job_id}
