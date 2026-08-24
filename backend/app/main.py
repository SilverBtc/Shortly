"""Point d'entrée FastAPI — TikTok Studio."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.database import init_db
from app.api.routes import (
    curation,
    pipeline,
    render,
    settings as settings_routes,
    spy,
    voice_design,
    wizard,
)
from app.workers import task_queue
from app.workers.handlers import register_all

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("tiktok-studio")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    await init_db()
    register_all()
    task_queue.start_worker()
    logger.info("Backend TikTok Studio démarré (db=%s)", settings.database_url)
    yield
    await task_queue.stop_worker()


app = FastAPI(title="TikTok Studio API", version="1.0.0", lifespan=lifespan)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = settings.api_prefix
app.include_router(curation.router, prefix=API_PREFIX)
app.include_router(spy.router, prefix=API_PREFIX)
app.include_router(pipeline.router, prefix=API_PREFIX)
app.include_router(render.router, prefix=API_PREFIX)
app.include_router(settings_routes.router, prefix=API_PREFIX)
app.include_router(wizard.router, prefix=API_PREFIX)
app.include_router(voice_design.router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health")
async def health() -> dict:
    return {"status": "ok", "app": settings.app_name}


# Médias statiques : /media/<asset|audio|output>/<filename>
media_dir: Path = settings.media_dir
media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")

# Wizard : fichiers temp des liens importés servis sous /storage/temp/...
storage_dir: Path = settings.storage_dir
storage_dir.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=storage_dir), name="storage")

# Wizard : échantillons vocaux Shortly servis sous /voices/ (StaticFiles = Range OK)
voices_dir: Path = settings.voices_dir
voices_dir.mkdir(parents=True, exist_ok=True)
app.mount("/voices", StaticFiles(directory=voices_dir), name="voices")
