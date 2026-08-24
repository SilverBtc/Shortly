"""Lecture/écriture des réglages applicatifs (table AppSetting + défauts)."""
from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.sql_models import AppSetting

logger = logging.getLogger(__name__)

# Niches par défaut — extensibles dynamiquement via /api/settings/niches
DEFAULT_NICHES: list[str] = [
    "Cuisine",
    "Nettoyage",
    "Barber",
    "Immobilier",
    "Artisanat",
    "Aviation / Pilotage",
]

DEFAULT_SETTINGS = {
    "llm_base_url": "llm_base_url",
    "llm_api_key": "llm_api_key",
    "llm_model": "llm_model",
    "tts_voice": "tts_voice",
    "tts_rate": "tts_rate",
    "tts_pitch": "tts_pitch",
    "whisper_model": "whisper_model",
    "whisper_device": "whisper_device",
    "discord_webhook_url": "discord_webhook_url",
    "niches": json.dumps(DEFAULT_NICHES, ensure_ascii=False),
}


def default_settings() -> dict:
    s = get_settings()
    return {
        "llm_base_url": s.llm_base_url,
        "llm_api_key": s.llm_api_key,
        "llm_model": s.llm_model,
        "tts_voice": s.tts_voice,
        "tts_rate": s.tts_rate,
        "tts_pitch": s.tts_pitch,
        "whisper_model": s.whisper_model,
        "whisper_device": s.whisper_device,
        "discord_webhook_url": s.discord_webhook_url,
        "niches": json.dumps(DEFAULT_NICHES, ensure_ascii=False),
    }


async def get_settings_map(db: AsyncSession) -> dict:
    """Retourne les réglages effectifs = défauts + surcharges DB."""
    merged = default_settings()
    rows = (await db.execute(select(AppSetting))).scalars().all()
    for row in rows:
        if row.key in merged:
            merged[row.key] = row.value
    return merged


async def upsert_settings(db: AsyncSession, values: dict) -> dict:
    """Écrit les réglages en base et retourne l'état fusionné."""
    for key, value in values.items():
        if key not in default_settings():
            continue
        row = await db.get(AppSetting, key)
        if row is None:
            db.add(AppSetting(key=key, value=str(value)))
        else:
            row.value = str(value)
    await db.commit()
    return await get_settings_map(db)


async def get_niches(db: AsyncSession) -> list[str]:
    """Liste des niches effectives (défauts + surcharge éventuelle)."""
    merged = await get_settings_map(db)
    try:
        niches = json.loads(merged.get("niches", "[]"))
        if isinstance(niches, list) and niches:
            return [str(n).strip() for n in niches if str(n).strip()]
    except (TypeError, ValueError):
        logger.warning("Réglage 'niches' illisible, retour aux défauts")
    return list(DEFAULT_NICHES)


async def set_niches(db: AsyncSession, niches: list[str]) -> list[str]:
    """Persiste la liste des niches et la retourne."""
    cleaned = [n.strip() for n in niches if n and n.strip()]
    if not cleaned:
        raise ValueError("La liste des niches ne peut pas être vide.")
    row = await db.get(AppSetting, "niches")
    payload = json.dumps(cleaned[:20], ensure_ascii=False)
    if row is None:
        db.add(AppSetting(key="niches", value=payload))
    else:
        row.value = payload
    await db.commit()
    return cleaned[:20]
