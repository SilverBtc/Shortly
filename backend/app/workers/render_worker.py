"""Moteur de rendu : préparation média (TTS + Whisper) + invocation Remotion CLI."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
from pathlib import Path


# ---------------------------------------------------------------------------
# Utilitaires chemins WSL <-> Windows
# ---------------------------------------------------------------------------
def _to_windows_path(path: Path) -> str:
    """Convertit un chemin WSL (/mnt/c/Users/...) en chemin Windows (C:\\Users\\...).

    Le backend tourne dans WSL (Python Linux) mais Remotion (npx) est lancé
    via le nœud Windows (nvm4w).  Les chemins /mnt/c/… ne sont pas compris
    par Node.js Windows → on les convertit pour les arguments de la CLI et
    le contenu des props.
    """
    s = str(path)
    if s.startswith("/mnt/") and len(s) > 6 and s[6] == "/":
        drive = s[5].upper()  # c → C
        return f"{drive}:{s[6:].replace('/', '\\')}"
    return s

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.sql_models import MediaAsset, ProjectAsset, VideoProject
from app.services import qwen_tts_service, tts_service
from app.services.discord_service import notify_render
from app.services.whisper_service import whisper_service

logger = logging.getLogger(__name__)

MIN_VIDEO_SECONDS = 55.0  # sous ce seuil, on considère le script trop court

SUBTITLE_PRESETS = {
    "classic": {
        "activeColor": "#FFD400",
        "inactiveColor": "#FFFFFF",
        "highlightColor": "#3B82F6",
        "fontSize": 64,
        "strokeWidth": 6,
    },
    "bold": {
        "activeColor": "#FFD400",
        "inactiveColor": "#FFFFFF",
        "highlightColor": "#EF4444",
        "fontSize": 74,
        "strokeWidth": 9,
    },
    "neon": {
        "activeColor": "#00FFCC",
        "inactiveColor": "#FFFFFF",
        "highlightColor": "#FF00FF",
        "fontSize": 60,
        "strokeWidth": 6,
    },
    # Presets Wizard (mission) : Bleu & Blanc / Jaune & Blanc / Vert flashy
    "blue-white": {
        "activeColor": "#3B82F6",
        "inactiveColor": "#FFFFFF",
        "highlightColor": "#FFD400",
        "fontSize": 66,
        "strokeWidth": 7,
    },
    "yellow-white": {
        "activeColor": "#FFD400",
        "inactiveColor": "#FFFFFF",
        "highlightColor": "#3B82F6",
        "fontSize": 66,
        "strokeWidth": 7,
    },
    "green-flashy": {
        "activeColor": "#00FF88",
        "inactiveColor": "#FFFFFF",
        "highlightColor": "#FF00FF",
        "fontSize": 66,
        "strokeWidth": 7,
    },
}

# Mots déclencheurs -> emoji synchronisé (sous-titres dynamiques)
EMOJI_TRIGGERS: list[tuple[str, str]] = [
    ("horreur", "💀"),
    ("peur", "😱"),
    ("panique", "😱"),
    ("argent", "💰"),
    ("payer", "💸"),
    ("client", "🤦"),
    ("cliente", "🤦"),
    ("bizarre", "🤨"),
    ("incroyable", "🤯"),
    ("propre", "✨"),
    ("sale", "🦠"),
    ("coupe", "✂️"),
    ("cheveux", "💇"),
    ("nettoy", "🧼"),
    ("cuisine", "🍳"),
    ("secret", "🤫"),
    ("jamais", "🚫"),
    ("dernière", "😤"),
    ("maison", "🏠"),
    ("appart", "🏠"),
    ("trouvé", "🔍"),
    ("découvre", "🔍"),
    ("cache", "🕵️"),
    ("vérité", "🤯"),
    ("premier", "🥇"),
    ("attention", "⚠️"),
    ("danger", "⚠️"),
    ("cauchemar", "😵"),
    ("incendie", "🔥"),
    ("feu", "🔥"),
]

MAX_EMOJIS = 6


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:40] or "video"


def assign_emojis(words: list[dict]) -> list[dict]:
    """Associe des emojis aux mots déclencheurs (max MAX_EMOJIS)."""
    emojis: list[dict] = []
    used: set[str] = set()
    for idx, word in enumerate(words):
        lowered = word.get("word", "").lower()
        for trigger, emoji in EMOJI_TRIGGERS:
            if emoji in used:
                continue
            if trigger in lowered:
                emojis.append({"afterIndex": idx, "emoji": emoji})
                used.add(emoji)
                break
        if len(emojis) >= MAX_EMOJIS:
            break
    return emojis


async def prepare_project_media(
    project: VideoProject, settings_map: dict
) -> tuple[Path, list[dict], float, str]:
    """TTS voix Shortly (SSML) + transcription Whisper word-level. Retourne
    (audio_path, words, duration_seconds, script_ssml).

    Mode « Aucune voix » (voice_id == "none") : montage seul — pas de voiceover,
    pas de sous-titres ; la durée provient des clips B-roll (61 s minimum).
    """
    no_voice = project.voice_id == "none"
    if not project.script_raw or not project.script_raw.strip():
        if not no_voice:
            raise ValueError("Le projet n'a pas de script — impossible de préparer l'audio.")
        return await _prepare_montage_only(project)

    audio_path = get_settings().audio_dir / f"project_{project.id}.mp3"
    ssml = tts_service.script_to_ssml(project.script_raw, voice=project.voice_id)

    # TTS idempotent : on ne régénère que si le fichier manque ou le script a changé
    needs_tts = not audio_path.exists() or audio_path.stat().st_size == 0
    if needs_tts:
        # La voix du projet fait foi (shortly:<nom> = voix designée via daemon Qwen TTS)
        voice_id = project.voice_id
        if qwen_tts_service.is_shortly(voice_id):
            if not qwen_tts_service.is_available():
                raise RuntimeError(
                    "Le daemon Qwen TTS n'est pas disponible — démarrez-le pour utiliser "
                    "les voix Shortly (voir qwenTTS/)."
                )
            wav, _dur = await asyncio.to_thread(
                qwen_tts_service.synthesize,
                project.script_raw,
                voice_id.split(":", 1)[1],
                get_settings().audio_dir,
            )
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(wav), "-codec:a", "libmp3lame",
                 "-qscale:a", "4", str(audio_path)],
                capture_output=True,
                check=True,
                timeout=300,
            )
        else:
            await tts_service.synthesize(
                project.script_raw,
                audio_path,
                voice=voice_id,
                rate=settings_map.get("tts_rate", "+0%"),
                pitch=settings_map.get("tts_pitch", "+0Hz"),
            )

    # Whisper word-level
    words, _ = await whisper_service.transcribe(
        audio_path,
        model_size=settings_map.get("whisper_model", "base"),
        device=settings_map.get("whisper_device", "cpu"),
        language="fr",
    )
    if not words:
        raise RuntimeError("Whisper n'a retourné aucun mot — vérifiez le fichier audio.")

    duration = round(words[-1]["end"] + 0.5, 3)
    logger.info("Projet %d : %d mots, %.1fs de voix off", project.id, len(words), duration)

    project.script_ssml = ssml
    project.audio_path = str(audio_path)
    project.timestamps_json = json.dumps(words, ensure_ascii=False)
    return audio_path, words, duration, ssml


async def _prepare_montage_only(project: VideoProject) -> tuple[Path, list[dict], float, str]:
    """Mode « Aucune voix » : montage seul sans voiceover ni sous-titres."""
    from app.core.database import SessionLocal

    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(MediaAsset.duration)
                .join(ProjectAsset, ProjectAsset.asset_id == MediaAsset.id)
                .where(ProjectAsset.project_id == project.id)
            )
        ).scalars().all()
    clip_total = sum(float(d or 4.0) for d in rows if d)
    duration = max(61.0, round(clip_total * 1.15, 2))
    logger.info(
        "Projet %d : montage seul (aucune voix) — durée clips %.1fs -> vidéo %.1fs",
        project.id,
        clip_total,
        duration,
    )
    project.script_ssml = ""
    project.audio_path = None
    project.timestamps_json = "[]"
    return Path(""), [], duration, ""


async def build_render_props(
    project: VideoProject, words: list[dict], duration: float, settings_map: dict
) -> dict:
    """Construit le JSON de props transmis à la composition Remotion TikTokVideo."""
    settings = get_settings()
    preset = SUBTITLE_PRESETS.get(project.subtitle_preset, SUBTITLE_PRESETS["classic"])

    # Clips B-roll liés au projet (hook en premier, puis ordre défini)
    from app.core.database import SessionLocal

    async with SessionLocal() as db:
        result = await db.execute(
            select(ProjectAsset, MediaAsset)
            .join(MediaAsset, MediaAsset.id == ProjectAsset.asset_id)
            .where(ProjectAsset.project_id == project.id)
            .order_by(ProjectAsset.is_hook.desc(), ProjectAsset.order_index.asc())
        )
        rows = result.all()

    clips = []
    for pa, asset in rows:
        if not Path(asset.file_path).exists():
            continue
        clips.append(
            {
                "path": _to_windows_path(Path(asset.file_path)),
                "duration": round(asset.duration or 4.0, 2),
                "isHook": bool(pa.is_hook),
                "title": asset.title,
                "thumbnail": _to_windows_path(Path(asset.thumbnail_path)) if asset.thumbnail_path else None,
            }
        )

    music_path = settings.data_dir / "music.mp3"
    # Musique choisie dans la bibliothèque wizard (chemin absolu) sinon musique par défaut
    if project.music_path and Path(project.music_path).exists():
        music_path = Path(project.music_path)
    elif not music_path.exists():
        music_path = None

    # Mask (Caption Mask) — zone floutée / recouverte par les sous-titres
    mask_area = None
    if project.mask_json:
        try:
            mask_data = json.loads(project.mask_json)
            if mask_data.get("enabled"):
                mask_area = {
                    "enabled": True,
                    "x": float(mask_data.get("x", 0)),
                    "y": float(mask_data.get("y", 0)),
                    "width": float(mask_data.get("width", 20)),
                    "height": float(mask_data.get("height", 15)),
                    "blurAmount": float(mask_data.get("blurAmount", 12)),
                }
        except (ValueError, TypeError):
            logger.warning("mask_json illisible pour le projet %d", project.id)

    props = {
        "audioPath": _to_windows_path(Path(project.audio_path)) if project.audio_path else None,
        "musicPath": _to_windows_path(music_path) if music_path else None,
        "durationSeconds": duration,
        "fps": 30,
        "width": 1080,
        "height": 1920,
        "banner": {
            "text": (project.banner_text or project.title).upper(),
            "showFirstSeconds": 3,
        },
        "captions": {
            "words": words or [],
            **preset,
            "fontFamily": "Montserrat",
            "fontWeight": 800,
            "emojis": assign_emojis(words or []),
            "animation": project.subtitle_animation or "word",
            "boxEnabled": bool(project.box_enabled),
        },
        "clips": clips,
        "maskArea": mask_area,
    }
    return props


async def run_remotion_render(project: VideoProject, props: dict) -> Path:
    """Invoque la CLI Remotion en sous-processus. Retourne le chemin du MP4."""
    settings = get_settings()
    out_path = settings.output_dir / f"tiktok_{project.id}_{_slugify(project.title)}.mp4"
    props_path = settings.tmp_dir / f"props_{project.id}.json"
    log_path = settings.tmp_dir / f"render_{project.id}.log"

    props_path.write_text(json.dumps(props, ensure_ascii=False), encoding="utf-8")

    # Remotion est lancé via npx Windows (nvm4w) depuis WSL → chemins Windows requis.
    out_arg = _to_windows_path(out_path)
    props_arg = _to_windows_path(props_path)

    if settings.remotion_bin:
        cmd = [
            settings.remotion_bin,
            "render",
            settings.remotion_entry,
            settings.remotion_composition,
            out_arg,
            "--props",
            props_arg,
        ]
    else:
        cmd = [
            "npx",
            "--no-install",
            "remotion",
            "render",
            settings.remotion_entry,
            settings.remotion_composition,
            out_arg,
            "--props",
            props_arg,
        ]

    logger.info("Lancement Remotion : %s (cwd=%s)", " ".join(cmd), settings.frontend_dir)
    with log_path.open("w", encoding="utf-8") as log_f:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(settings.frontend_dir),
            stdout=log_f,
            stderr=subprocess.STDOUT,
            env={**os.environ, "CI": "1"},
        )
        return_code = await proc.wait()

    if return_code != 0:
        tail = ""
        try:
            tail = "\n".join(log_path.read_text(encoding="utf-8").splitlines()[-25:])
        except OSError:
            pass
        raise RuntimeError(f"Remotion a échoué (code {return_code}) :\n{tail}")

    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"Remotion n'a pas produit de fichier : {out_path}")

    logger.info("Rendu OK : %s (%d octets)", out_path, out_path.stat().st_size)
    return out_path


async def render_project(project_id: int, settings_map: dict, job_id: str) -> dict:
    """Pipeline complet : TTS -> Whisper -> props -> Remotion -> MP4 -> Discord."""
    settings = get_settings()
    from app.core.database import SessionLocal

    async with SessionLocal() as db:
        project = await db.get(VideoProject, project_id)
        if project is None:
            raise ValueError(f"Projet {project_id} introuvable.")

        project.status = "rendering"
        await db.commit()
        await db.refresh(project)

        try:
            audio_path, words, duration, ssml = await prepare_project_media(project, settings_map)
            props = await build_render_props(project, words, duration, settings_map)
            project.audio_path = str(audio_path)
            project.script_ssml = ssml
            project.timestamps_json = json.dumps(words, ensure_ascii=False)
            await db.commit()

            out_path = await run_remotion_render(project, props)
        except Exception:
            project.status = "failed"
            await db.commit()
            raise

        project.output_path = str(out_path)
        project.status = "completed"
        await db.commit()
        await db.refresh(project)

        filename = out_path.name
        mp4_url = f"{settings.public_base_url}/media/output/{filename}"
        await notify_render(
            settings_map.get("discord_webhook_url", ""),
            project_title=project.title,
            niche=project.niche,
            duration_seconds=duration,
            status="completed",
            mp4_url=mp4_url,
        )

        return {
            "output_path": str(out_path),
            "output_url": mp4_url,
            "duration_seconds": duration,
            "words_count": len(words),
        }
