"""Schémas Pydantic v2 (validation stricte)."""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

# Les niches sont EXTENSIBLES dynamiquement via /api/settings/niches :
# la validation accepte toute chaîne courte (max 64), la liste affichée
# dans l'UI provient des réglages (GET /api/settings/niches).
Niche = Annotated[str, Field(max_length=64)]
AssetStatus = Literal["pending", "approved", "rejected"]
ProjectStatus = Literal["draft", "ready", "rendering", "completed", "failed"]
SourceType = Literal["profile", "hashtag", "url"]
JobKind = Literal["scrape", "spy", "prepare", "render"]
JobStatus = Literal["queued", "running", "completed", "failed"]


# ---------------------------------------------------------------------------
# Curation
# ---------------------------------------------------------------------------
class ScrapeRequest(BaseModel):
    source_type: SourceType = Field(description="profile / hashtag / url")
    query: str = Field(min_length=1, max_length=512)
    limit: int = Field(default=8, ge=1, le=50)
    niche: Niche | None = None


class MediaAssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_url: str
    file_path: str
    thumbnail_path: str | None = None
    title: str | None = None
    niche: str | None = None
    status: str
    duration: float | None = None
    created_at: str | None = None


# ---------------------------------------------------------------------------
# Spy
# ---------------------------------------------------------------------------
class SpyRequest(BaseModel):
    tiktok_url: HttpUrl


class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------
class ProjectAssetIn(BaseModel):
    asset_id: int
    order_index: int = 0
    is_hook: bool = False


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    banner_text: str = ""
    niche: Niche | None = None
    script_raw: str = ""
    voice_id: str = "shortly:antoine"
    subtitle_preset: str = "classic"
    subtitle_animation: str = "word"  # word | phrase
    box_enabled: bool = False
    mask_json: str | None = None
    music_path: str | None = None
    assets: list[ProjectAssetIn] = []


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    banner_text: str | None = None
    niche: Niche | None = None
    script_raw: str | None = None
    voice_id: str | None = None
    subtitle_preset: str | None = None
    subtitle_animation: str | None = None
    box_enabled: bool | None = None
    mask_json: str | None = None
    music_path: str | None = None
    status: ProjectStatus | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    banner_text: str
    niche: str | None = None
    script_raw: str
    script_ssml: str | None = None
    status: str
    voice_id: str
    subtitle_preset: str
    subtitle_animation: str = "word"
    box_enabled: bool = False
    mask_json: str | None = None
    music_path: str | None = None
    audio_path: str | None = None
    timestamps_json: str | None = None
    output_path: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ProjectDetailOut(BaseModel):
    item: ProjectOut
    assets: list[dict]


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
class SettingsIn(BaseModel):
    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = ""
    llm_model: str = ""
    tts_voice: str = ""
    tts_rate: str = "+0%"
    tts_pitch: str = "+0Hz"
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    discord_webhook_url: str = ""


class SettingsOut(BaseModel):
    settings: SettingsIn


class NichesIn(BaseModel):
    niches: list[Niche] = Field(min_length=1, max_length=20, description="Liste des niches disponibles")


class NichesOut(BaseModel):
    niches: list[str]


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------
class JobOut(BaseModel):
    job_id: str
    kind: JobKind
    status: JobStatus
    result: dict | list | None = None
    error: str | None = None
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Wizard (tunnel 5 étapes)
# ---------------------------------------------------------------------------
class WizardFetchRequest(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=20, description="URLs TikTok / YouTube Shorts")
    niche: Niche | None = None


class WizardLinkItemOut(BaseModel):
    id: str  # identifiant temporaire du lien importé
    url: str
    title: str | None = None
    thumbnail: str | None = None  # chemin relatif servable (/storage/...)
    video: str | None = None  # chemin relatif servable
    duration: float | None = None
    view_count: int | None = None
    hashtags: list[str] = []
    status: str = "ready"


class WizardFetchResponse(BaseModel):
    items: list[WizardLinkItemOut]


class WizardIdeaRequest(BaseModel):
    idea: str = Field(min_length=3, max_length=4000, description="Notes brutes / idées d'histoire")
    niche: Niche | None = None


class WizardOptimizeRequest(BaseModel):
    script: str = Field(min_length=10, max_length=6000)


class WizardScriptOut(BaseModel):
    script: str


class WizardTtsPreviewRequest(BaseModel):
    text: str = Field(min_length=1, max_length=400)
    voice: str = "shortly:antoine"


class WizardTtsPreviewOut(BaseModel):
    audio_url: str  # chemin relatif servable (/storage/...)


# ---- Voice Design (Qwen3-TTS) ----

class VoiceDesignPlanRequest(BaseModel):
    situation: str = Field(min_length=5, max_length=4000, description="Description de la situation/contexte vidéo")
    duration_s: float = Field(gt=2, le=600, description="Durée audio cible en secondes")
    language: str = Field(default="Français", max_length=40)


class VoiceDesignParams(BaseModel):
    temperature: float = 0.9
    top_p: float = 0.95
    top_k: int = 50
    repetition_penalty: float = 1.05
    subtalker_temperature: float | None = None
    subtalker_top_p: float | None = None
    subtalker_top_k: int | None = None


class VoiceDesignPlanOut(BaseModel):
    script: str
    instruct: str
    params: VoiceDesignParams


class VoiceDesignGenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    instruct: str = Field(min_length=1, max_length=2000)
    language: str | None = Field(default=None, max_length=40)
    params: VoiceDesignParams = Field(default_factory=VoiceDesignParams)


class VoiceDesignAudioOut(BaseModel):
    audio_url: str          # chemin relatif servable (/storage/temp/qwen/...)
    duration_s: float
    elapsed_s: float | None = None


# ---- Wizard : schémas suite (restaurés) ----

class WizardConcurrentRequest(BaseModel):
    url: str = Field(min_length=1, max_length=1024)


class WizardMusicItemOut(BaseModel):
    name: str
    category: str
    path: str  # chemin relatif servable (/storage/...)
    duration: float | None = None


class WizardMusicLibraryOut(BaseModel):
    items: list[WizardMusicItemOut]


class WizardVoiceItemOut(BaseModel):
    name: str
    file: str
    duration: float | None = None


class WizardVoicesOut(BaseModel):
    items: list[WizardVoiceItemOut]
    clone_available: bool  # daemon Qwen TTS joignable → voix Shortly disponibles


class WizardMaskArea(BaseModel):
    enabled: bool
    x: float = Field(ge=0, le=100)   # pourcentage 0-100
    y: float = Field(ge=0, le=100)
    width: float = Field(ge=0, le=100)
    height: float = Field(ge=0, le=100)
    blurAmount: float = Field(ge=0, le=100)


class WizardRenderLinkIn(BaseModel):
    url: str = Field(min_length=1, max_length=1024)
    video: str | None = None
    thumbnail: str | None = None
    title: str | None = None
    is_hook: bool = False


class WizardLinkIn(BaseModel):
    url: str = Field(min_length=1, max_length=1024)
    video: str | None = None
    thumbnail: str | None = None
    title: str | None = None
    is_hook: bool = False


class WizardRenderRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    banner_text: str | None = Field(default=None, max_length=300)
    niche: Niche | None = None
    script: str = ""
    voice_id: str = "none"
    subtitle_preset: str = "classic"
    subtitle_animation: Literal["word", "phrase"] = "word"
    box_enabled: bool = False
    mask: WizardMaskArea | None = None
    music_path: str | None = None
    links: list[WizardRenderLinkIn] = Field(default_factory=list)


class WizardRenderOut(BaseModel):
    project_id: int
    job_id: str
