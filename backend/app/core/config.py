"""Configuration centrale de l'application (pydantic-settings)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TIKTOK_", extra="ignore")

    app_name: str = "TikTok Studio"
    api_prefix: str = "/api"
    debug: bool = True

    # --- Base de données ---
    database_url: str = "sqlite+aiosqlite:///./data/app.db"

    # --- Répertoires ---
    # Racine des données : surchargeable via TIKTOK_DATA_DIR (tests isolés).
    data_dir: Path = BASE_DIR / "data"

    # Dérivés de data_dir (propriétés) : surcharger data_dir redirige tout.
    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"

    @property
    def assets_dir(self) -> Path:
        return self.data_dir / "media" / "assets"

    @property
    def audio_dir(self) -> Path:
        return self.data_dir / "media" / "audio"

    @property
    def output_dir(self) -> Path:
        return self.data_dir / "media" / "output"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"

    @property
    def music_dir(self) -> Path:
        return self.data_dir / "music"

    @property
    def voices_dir(self) -> Path:
        return self.data_dir / "voices"

    # Stockage temporaire wizard (servi sous /storage) : surchargeable TIKTOK_STORAGE_DIR
    storage_dir: Path = BASE_DIR / "storage"

    @property
    def wizard_dir(self) -> Path:
        return self.storage_dir / "temp"

    # --- Remotion ---
    frontend_dir: Path = BASE_DIR.parent / "frontend"
    remotion_entry: str = "src/remotion/index.ts"
    remotion_composition: str = "TikTokVideo"
    remotion_bin: str = ""  # laisser vide = `npx remotion` ; sinon chemin absolu (utile en test)

    # --- LLM par défaut (surchargé par la table AppSetting) ---
    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = "ollama"
    llm_model: str = "qwen2.5:7b"

    # --- Voix Shortly par défaut (backend/data/voices/, daemon Qwen TTS) ---
    tts_voice: str = ""  # vide = voix du projet (shortly:*) au rendu
    tts_rate: str = "+0%"
    tts_pitch: str = "+0Hz"

    # --- Whisper par défaut ---
    whisper_model: str = "base"
    whisper_device: str = "cpu"

    # --- Discord ---
    discord_webhook_url: str = ""

    # --- URL publique de base (liens MP4 dans les notifications Discord) ---
    public_base_url: str = "http://localhost:8000"

    # --- CORS ---
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    def ensure_dirs(self) -> None:
        for d in (
            self.data_dir,
            self.media_dir,
            self.assets_dir,
            self.audio_dir,
            self.output_dir,
            self.tmp_dir,
            self.storage_dir,
            self.wizard_dir,
            self.music_dir,
            self.voices_dir,
        ):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.ensure_dirs()
    return s
