"""Base de données asynchrone : moteur SQLAlchemy 2.0 + aiosqlite."""
from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def _make_engine():
    settings = get_settings()
    return create_async_engine(
        settings.database_url,
        echo=False,
        connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
    )


engine = _make_engine()
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Crée les tables si elles n'existent pas (dev) ; Alembic reste la voie migrations."""
    from app.models.sql_models import AppSetting, MediaAsset, ProjectAsset, VideoProject  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await ensure_wizard_columns()


async def ensure_wizard_columns() -> None:
    """Migration idempotente : colonnes Wizard ajoutées aux tables existantes (SQLite)."""
    wanted = {
        "video_projects": {
            "subtitle_animation": "VARCHAR(16) DEFAULT 'word'",
            "box_enabled": "BOOLEAN DEFAULT 0",
            "mask_json": "TEXT",
            "music_path": "VARCHAR(512)",
        }
    }
    async with engine.begin() as conn:
        for table, columns in wanted.items():
            rows = (
                await conn.execute(
                    text(f"SELECT name FROM pragma_table_info('{table}')")
                )
            ).fetchall()
            existing = {r[0] for r in rows}
            for col, ddl in columns.items():
                if col not in existing:
                    await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
                    logger.info("Colonne ajoutée : %s.%s", table, col)
