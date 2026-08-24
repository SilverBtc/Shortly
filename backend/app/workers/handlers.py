"""Handlers des jobs : scraping, spy (transcription + réécriture), prepare, render."""
from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.sql_models import MediaAsset, VideoProject
from app.services import scraper_service, whisper_service
from app.services.llm_service import LLMService
from app.services.settings_service import get_settings_map
from app.workers import task_queue
from app.workers.render_worker import prepare_project_media, render_project

logger = logging.getLogger(__name__)


async def handle_scrape(payload: dict, job_id: str) -> dict:
    settings = get_settings()
    outdir = settings.assets_dir / uuid.uuid4().hex[:10]
    items = await scraper_service.scrape_entries(
        source_type=payload["source_type"],
        query=payload["query"],
        limit=int(payload.get("limit", 8)),
        outdir=outdir,
    )
    niche = payload.get("niche")

    saved = []
    async with SessionLocal() as db:
        for item in items:
            asset = MediaAsset(
                source_url=item["source_url"],
                file_path=item["file_path"],
                thumbnail_path=item["thumbnail_path"],
                title=item.get("title"),
                niche=niche,
                status="pending",
                duration=item.get("duration"),
            )
            db.add(asset)
            await db.flush()
            saved.append(asset.to_dict())
        await db.commit()

    return {"items": saved}


async def handle_spy(payload: dict, job_id: str) -> dict:
    settings = get_settings()
    settings_map = await get_settings_map_shortcut()

    # 1) Extraction audio TikTok -> mp3
    audio_dir = settings.tmp_dir / f"spy_{uuid.uuid4().hex[:8]}"
    audio_path = await scraper_service.download_audio(payload["tiktok_url"], audio_dir)

    # 2) Transcription mot-à-mot
    words, _ = await whisper_service.transcribe(
        audio_path,
        model_size=settings_map.get("whisper_model", "base"),
        device=settings_map.get("whisper_device", "cpu"),
        language="fr",
    )
    if not words:
        raise RuntimeError("Aucune transcription obtenue pour cette vidéo.")
    text = " ".join(w["word"] for w in words)

    # 3) Réécriture LLM en 3 variations
    llm = LLMService(
        base_url=settings_map.get("llm_base_url", settings.llm_base_url),
        api_key=settings_map.get("llm_api_key", ""),
        model=settings_map.get("llm_model", settings.llm_model),
    )
    scripts = await llm.rewrite_scripts(text, count=3)

    return {"text": text, "transcript": words, "scripts": scripts}


async def handle_prepare(payload: dict, job_id: str) -> dict:
    async with SessionLocal() as db:
        project = await db.get(VideoProject, payload["project_id"])
        if project is None:
            raise ValueError(f"Projet {payload['project_id']} introuvable.")
        settings_map = await get_settings_map(db)
        audio_path, words, duration, ssml = await prepare_project_media(project, settings_map)
        project.script_ssml = ssml
        project.audio_path = str(audio_path)
        project.timestamps_json = json.dumps(words, ensure_ascii=False)
        await db.commit()

    return {
        "audio_path": str(audio_path),
        "timestamps": words,
        "duration_seconds": duration,
        "script_ssml": ssml,
    }


async def handle_render(payload: dict, job_id: str) -> dict:
    settings_map = await get_settings_map_shortcut()
    return await render_project(payload["project_id"], settings_map, job_id)


async def get_settings_map_shortcut() -> dict:
    async with SessionLocal() as db:
        return await get_settings_map(db)


# Enregistrement des handlers (importé par main.py pour peupler le registry)
def register_all() -> None:
    task_queue.register_handler("scrape", handle_scrape)
    task_queue.register_handler("spy", handle_spy)
    task_queue.register_handler("prepare", handle_prepare)
    task_queue.register_handler("render", handle_render)
