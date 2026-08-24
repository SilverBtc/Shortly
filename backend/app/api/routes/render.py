"""Jobs & rendu : polling du statut des tâches de fond."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.pydantic_schemas import JobOut
from app.workers import task_queue

router = APIRouter(tags=["render"])


@router.get("/jobs", response_model=dict)
async def list_jobs() -> dict:
    return {"items": task_queue.list_jobs()}


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: str) -> dict:
    job = task_queue.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job introuvable")
    return job
