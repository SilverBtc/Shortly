"""Module 4 — Configuration Système : LLM, TTS, Whisper, Discord, niches."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.pydantic_schemas import NichesIn, NichesOut, SettingsIn, SettingsOut
from app.services.settings_service import get_niches, get_settings_map, set_niches, upsert_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)) -> dict:
    merged = await get_settings_map(db)
    return {"settings": merged}


@router.put("", response_model=SettingsOut)
async def put_settings(body: SettingsIn, db: AsyncSession = Depends(get_db)) -> dict:
    values = body.model_dump()
    merged = await upsert_settings(db, values)
    return {"settings": merged}


@router.get("/niches", response_model=NichesOut)
async def get_niches_route(db: AsyncSession = Depends(get_db)) -> dict:
    """Liste dynamique des niches disponibles."""
    return {"niches": await get_niches(db)}


@router.put("/niches", response_model=NichesOut)
async def put_niches(body: NichesIn, db: AsyncSession = Depends(get_db)) -> dict:
    """Remplace la liste des niches (extensible depuis les réglages)."""
    try:
        niches = await set_niches(db, body.niches)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"niches": niches}
