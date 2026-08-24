"""Module Wizard 5 étapes — import de liens, script IA, preview TTS, rendu complet."""
from __future__ import annotations

import json
import logging
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.models.pydantic_schemas import (
    WizardConcurrentRequest,
    WizardFetchRequest,
    WizardFetchResponse,
    WizardIdeaRequest,
    WizardLinkIn,
    WizardMusicItemOut,
    WizardMusicLibraryOut,
    WizardOptimizeRequest,
    WizardRenderOut,
    WizardRenderRequest,
    WizardScriptOut,
    WizardTtsPreviewOut,
    WizardTtsPreviewRequest,
    WizardVoiceItemOut,
    WizardVoicesOut,
)
from app.models.sql_models import MediaAsset, ProjectAsset, VideoProject
from app.services import qwen_tts_service, wizard_service
from app.services.llm_service import LLMService
from app.services.settings_service import get_settings_map
from app.workers import task_queue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wizard", tags=["wizard"])


@router.post("/fetch-links", response_model=WizardFetchResponse)
async def fetch_links(body: WizardFetchRequest) -> WizardFetchResponse:
    """Étape 1 : télécharge les métadonnées + vidéos des URLs (TikTok / YouTube Shorts)."""
    items = await __import__("asyncio").to_thread(wizard_service.fetch_links, body.urls)
    return WizardFetchResponse(items=items)


@router.post("/generate-script-from-idea", response_model=WizardScriptOut)
async def generate_script_from_idea(
    body: WizardIdeaRequest, db: AsyncSession = Depends(get_db)
) -> WizardScriptOut:
    """Étape 4 — Option A : idées brutes -> script viral balisé (prompt mission)."""
    settings_map = await get_settings_map(db)
    settings = get_settings()
    llm = LLMService(
        base_url=settings_map.get("llm_base_url", settings.llm_base_url),
        api_key=settings_map.get("llm_api_key", ""),
        model=settings_map.get("llm_model", settings.llm_model),
    )
    script = await llm.generate_script_from_idea(body.idea, niche=body.niche)
    return WizardScriptOut(script=script)


@router.post("/optimize-script", response_model=WizardScriptOut)
async def optimize_script(body: WizardOptimizeRequest, db: AsyncSession = Depends(get_db)) -> WizardScriptOut:
    """Étape 4 — ⚡ Optimiser : recalibre le script pour 61-65 s d'élocution."""
    settings_map = await get_settings_map(db)
    settings = get_settings()
    llm = LLMService(
        base_url=settings_map.get("llm_base_url", settings.llm_base_url),
        api_key=settings_map.get("llm_api_key", ""),
        model=settings_map.get("llm_model", settings.llm_model),
    )
    script = await llm.optimize_script(body.script)
    return WizardScriptOut(script=script)


@router.post("/fetch-concurrent-script", response_model=dict)
async def fetch_concurrent_script(body: WizardConcurrentRequest) -> dict:
    """Étape 4 — Option B : URL concurrente -> Whisper -> LLM 3 variations (job async)."""
    job_id = task_queue.enqueue("spy", {"tiktok_url": body.url})
    return {"job_id": job_id}


@router.post("/tts-preview", response_model=WizardTtsPreviewOut)
async def tts_preview(body: WizardTtsPreviewRequest) -> WizardTtsPreviewOut:
    """Étape 3 : preview audio d'une voix Shortly (voix designée via daemon Qwen TTS)."""
    rel = await wizard_service.tts_preview(body.text, body.voice)
    return WizardTtsPreviewOut(audio_url=f"/storage/{rel}")


@router.get("/music-library", response_model=WizardMusicLibraryOut)
async def music_library() -> WizardMusicLibraryOut:
    """Étape 3 : bibliothèque locale de musiques libres (backend/data/music/)."""
    items = await __import__("asyncio").to_thread(wizard_service.list_music_library)
    return WizardMusicLibraryOut(items=items)


@router.get("/voices", response_model=WizardVoicesOut)
async def voice_samples() -> WizardVoicesOut:
    """Étape 3 : échantillons vocaux personnalisés (backend/data/voices/ — Shortly).

    ``clone_available`` indique si le daemon Qwen TTS est joignable — dans ce cas
    les voix Shortly sont sélectionnables comme voix de narration (``shortly:<nom>``).
    """
    items = await __import__("asyncio").to_thread(wizard_service.list_voice_samples)
    clone_available = qwen_tts_service.is_available()
    return WizardVoicesOut(items=items, clone_available=clone_available)


@router.get("/music/audio/{name}")
async def music_audio(name: str) -> FileResponse:
    """Pré-écoute d'une musique de la bibliothèque locale (nom avec ou sans extension)."""
    settings = get_settings()
    candidates = [Path(name), Path(f"{name}.mp3"), Path(f"{name}.wav"), Path(f"{name}.m4a"), Path(f"{name}.ogg")]
    for c in candidates:
        path = (settings.music_dir / c.name).resolve()
        if path.is_file() and settings.music_dir.resolve() in path.parents:
            return FileResponse(path, media_type="audio/mpeg")
    raise HTTPException(status_code=404, detail="Musique introuvable")


def _copy_to_assets(rel_path: str | None, dest_dir: Path) -> str | None:
    """Copie un fichier temp (chemin relatif /storage) vers le dossier assets."""
    if not rel_path:
        return None
    settings = get_settings()
    src = (settings.storage_dir / rel_path).resolve()
    if not src.is_file():
        return None
    dest = dest_dir / src.name
    shutil.copy2(src, dest)
    return str(dest)


@router.post("/render", response_model=WizardRenderOut)
async def render(body: WizardRenderRequest, db: AsyncSession = Depends(get_db)) -> WizardRenderOut:
    """Étape 5 : crée le projet pipeline (assets liés) et lance prepare + render."""
    settings = get_settings()
    if not body.script.strip() and body.voice_id != "none":
        raise HTTPException(
            status_code=422,
            detail="Le script est vide : activez une voix IA ou choisissez le mode « Aucune voix ».",
        )
    if not body.links:
        raise HTTPException(
            status_code=422,
            detail="Aucun lien fourni : importez au moins une vidéo (Étape 1).",
        )
    project = VideoProject(
        title=body.title,
        banner_text=body.banner_text,
        niche=body.niche,
        script_raw=body.script,
        voice_id=body.voice_id,
        subtitle_preset=body.subtitle_preset,
        subtitle_animation=body.subtitle_animation,
        box_enabled=body.box_enabled,
        mask_json=json.dumps(body.mask.model_dump()) if body.mask else None,
        music_path=body.music_path,
        status="draft",
    )
    db.add(project)
    await db.flush()

    for idx, link in enumerate(body.links):
        asset = await _resolve_asset(db, link, settings, idx)
        db.add(
            ProjectAsset(
                project_id=project.id,
                asset_id=asset.id,
                order_index=idx,
                is_hook=bool(link.is_hook),
            )
        )
    await db.commit()
    await db.refresh(project)

    prepare_job = task_queue.enqueue("prepare", {"project_id": project.id})
    render_job = task_queue.enqueue("render", {"project_id": project.id})
    logger.info(
        "Wizard render : projet %d (jobs prepare=%s, render=%s)",
        project.id,
        prepare_job,
        render_job,
    )
    return WizardRenderOut(project_id=project.id, job_id=render_job)


async def _resolve_asset(
    db: AsyncSession, link: WizardLinkIn, settings, order_index: int
) -> MediaAsset:
    """Retrouve un MediaAsset existant (même source_url) ou le crée depuis les fichiers temp."""
    existing = (
        await db.execute(select(MediaAsset).where(MediaAsset.source_url == link.url))
    ).scalars().first()
    if existing is not None:
        return existing

    dest_dir = settings.assets_dir / uuid.uuid4().hex[:10]
    dest_dir.mkdir(parents=True, exist_ok=True)
    file_path = _copy_to_assets(link.video, dest_dir)
    if file_path is None:
        # Fichier temp introuvable : on tente un re-téléchargement direct via yt-dlp
        from app.services.scraper_service import download_single

        item = await download_single(link.url, dest_dir)
        file_path = item["file_path"]
        thumb_path = item.get("thumbnail_path")
        title = item.get("title")
    else:
        thumb_path = _copy_to_assets(link.thumbnail, dest_dir)
        title = link.title

    asset = MediaAsset(
        source_url=link.url,
        file_path=file_path,
        thumbnail_path=thumb_path,
        title=title,
        niche=None,
        status="approved",
    )
    db.add(asset)
    await db.flush()
    return asset
