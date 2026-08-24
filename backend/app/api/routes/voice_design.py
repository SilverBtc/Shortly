"""Routes Voice Design — Qwen3-TTS-12Hz-1.7B-VoiceDesign + LLM.

Flux :
  POST /api/voice-design/plan      → situation + durée → {script, instruct, params} (LLM)
  POST /api/voice-design/generate  → script + instruct + params → audio WAV (daemon Qwen)
  GET  /api/voice-design/status    → daemon Qwen disponible ?
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import get_settings
from app.core.database import get_db
from app.models.pydantic_schemas import (
    VoiceDesignAudioOut,
    VoiceDesignGenerateRequest,
    VoiceDesignPlanOut,
    VoiceDesignPlanRequest,
)
from app.services import qwen_tts_service
from app.services.llm_service import LLMService
from app.services.settings_service import get_settings_map

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice-design", tags=["voice-design"])


@router.get("/status")
async def status() -> dict:
    """État du daemon Qwen TTS (modèle chargé en mémoire ?)."""
    return {"available": qwen_tts_service.is_available(), "url": qwen_tts_service.QWEN_DAEMON_URL}


@router.post("/plan", response_model=VoiceDesignPlanOut)
async def plan(body: VoiceDesignPlanRequest, db=Depends(get_db)) -> VoiceDesignPlanOut:
    """Étape 1 : la situation + la durée → script complet + instruct voix + params (LLM)."""
    settings_map = await get_settings_map(db)
    settings = get_settings()
    llm = LLMService(
        base_url=settings_map.get("llm_base_url", settings.llm_base_url),
        api_key=settings_map.get("llm_api_key", ""),
        model=settings_map.get("llm_model", settings.llm_model),
    )
    try:
        result = await llm.design_voice(body.situation, body.duration_s, language=body.language)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"Réponse LLM invalide : {exc}") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return VoiceDesignPlanOut(
        script=result["script"],
        instruct=result["instruct"],
        params={**{"temperature": 0.9, "top_p": 0.95, "top_k": 50, "repetition_penalty": 1.05}, **result["params"]},
    )


@router.post("/generate", response_model=VoiceDesignAudioOut)
async def generate(body: VoiceDesignGenerateRequest) -> VoiceDesignAudioOut:
    """Étape 2 : synthèse du script avec la voix designée (daemon Qwen TTS)."""
    if not qwen_tts_service.is_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "Le daemon Qwen TTS n'est pas disponible — démarrez-le : "
                "python qwenTTS/qwen_server.py --device cpu --dtype float32 --port 7863"
            ),
        )

    settings = get_settings()
    out_dir = settings.wizard_dir / "qwen"

    def _run():
        return qwen_tts_service.generate(
            text=body.text,
            instruct=body.instruct,
            output_dir=out_dir,
            language=body.language,
            temperature=body.params.temperature,
            top_p=body.params.top_p,
            top_k=int(body.params.top_k),
            repetition_penalty=body.params.repetition_penalty,
            subtalker_temperature=body.params.subtalker_temperature,
            subtalker_top_p=body.params.subtalker_top_p,
            subtalker_top_k=(int(body.params.subtalker_top_k) if body.params.subtalker_top_k is not None else None),
        )

    try:
        wav_path, duration_s = await asyncio.to_thread(_run)
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Échec génération Qwen TTS")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc

    rel = f"temp/qwen/{wav_path.name}"
    return VoiceDesignAudioOut(audio_url=rel, duration_s=duration_s)
