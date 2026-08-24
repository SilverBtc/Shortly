"""Modèles SQLAlchemy 2.0 (asynchrone)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

NICHES = ("Cuisine", "Nettoyage", "Barber", "Immobilier", "Artisanat", "Aviation / Pilotage")

ASSET_STATUSES = ("pending", "approved", "rejected")
PROJECT_STATUSES = ("draft", "ready", "rendering", "completed", "failed")

TTS_VOICES = ()
SUBTITLE_PRESETS = ("classic", "bold", "neon")


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    thumbnail_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    niche: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source_url": self.source_url,
            "file_path": self.file_path,
            "thumbnail_path": self.thumbnail_path,
            "title": self.title,
            "niche": self.niche,
            "status": self.status,
            "duration": self.duration,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class VideoProject(Base):
    __tablename__ = "video_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    banner_text: Mapped[str] = mapped_column(String(512), default="")
    niche: Mapped[str | None] = mapped_column(String(64), nullable=True)
    script_raw: Mapped[str] = mapped_column(Text, default="")
    script_ssml: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)
    voice_id: Mapped[str] = mapped_column(String(128), default="shortly:antoine")
    subtitle_preset: Mapped[str] = mapped_column(String(32), default="classic")
    # --- Options Wizard (masquage, animation sous-titres, box, musique) ---
    subtitle_animation: Mapped[str] = mapped_column(String(16), default="word")  # word | phrase
    box_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mask_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    music_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    audio_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    timestamps_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    assets: Mapped[list["ProjectAsset"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="ProjectAsset.order_index"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "banner_text": self.banner_text,
            "niche": self.niche,
            "script_raw": self.script_raw,
            "script_ssml": self.script_ssml,
            "status": self.status,
            "voice_id": self.voice_id,
            "subtitle_preset": self.subtitle_preset,
            "subtitle_animation": self.subtitle_animation,
            "box_enabled": self.box_enabled,
            "mask_json": self.mask_json,
            "music_path": self.music_path,
            "audio_path": self.audio_path,
            "timestamps_json": self.timestamps_json,
            "output_path": self.output_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ProjectAsset(Base):
    __tablename__ = "project_assets"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("video_projects.id", ondelete="CASCADE"), primary_key=True
    )
    asset_id: Mapped[int] = mapped_column(
        ForeignKey("media_assets.id", ondelete="CASCADE"), primary_key=True
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    is_hook: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped[VideoProject] = relationship(back_populates="assets")
    asset: Mapped[MediaAsset] = relationship(lazy="joined")

    def to_dict(self) -> dict:
        return {
            "asset": self.asset.to_dict() if self.asset else None,
            "order_index": self.order_index,
            "is_hook": self.is_hook,
        }


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
