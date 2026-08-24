"""Service du Wizard 5 étapes : import de liens (yt-dlp), preview TTS, bibliothèque musique.

Étape 1 : `fetch_links(urls)` télécharge chaque URL TikTok / YouTube Shorts dans
`backend/storage/temp/<id>/` (fichiers servis sous /storage) et renvoie les métadonnées
(titre, miniature, durée, vues, hashtags) sans rien enregistrer en base.
"""
from __future__ import annotations

import asyncio
import logging
import re
import subprocess
import uuid
from pathlib import Path

import httpx
import yt_dlp

from app.core.config import get_settings

logger = logging.getLogger(__name__)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}

VIDEO_SUFFIXES = (".mp4", ".mov", ".webm", ".mkv")
IMAGE_SUFFIXES = (".jpg", ".jpeg", ".webp", ".png")

MUSIC_CATEGORIES = {
    "suspense": "Suspense",
    "dynamique": "Dynamique",
    "lofi": "Lofi",
    "emotion": "Émotion",
    "calme": "Émotion",
    "tension": "Suspense",
    "energie": "Dynamique",
    "energique": "Dynamique",
    "triste": "Émotion",
    # Musiques importées de la bibliothèque Shortly
    "nightmare": "Suspense",
    "horreur": "Suspense",
    "dark": "Suspense",
    "empire": "Dynamique",
    "sprinter": "Dynamique",
    "instru": "Dynamique",
    "temporary": "Émotion",
    "melting": "Émotion",
    "slow": "Émotion",
    "glass": "Émotion",
    "turu": "Lofi",
    "chill": "Lofi",
}


def _ydl_opts(outdir: Path, cookies: bool = True) -> dict:
    settings = get_settings()
    opts: dict = {
        "outtmpl": str(outdir / "%(id)s.%(ext)s"),
        "format": "bv*[height<=1080]+ba/b",
        "merge_output_format": "mp4",
        "writethumbnail": True,
        "quiet": True,
        "no_warnings": True,
        "http_headers": DEFAULT_HEADERS,
        "socket_timeout": 20,
        "retries": 2,
    }
    # Cookies TikTok (optionnels) — même mécanisme que le scraping curation
    if cookies:
        cookiefile = settings.data_dir / "tiktok_cookies.txt"
        if cookiefile.exists():
            opts["cookiefile"] = str(cookiefile)
    return opts


def _extract_hashtags(info: dict) -> list[str]:
    tags = info.get("tags") or []
    hashtags = [t for t in tags if t.startswith("#")]
    if hashtags:
        return hashtags[:12]
    desc = info.get("description") or ""
    return [f"#{m}" for m in re.findall(r"#(\w+)", desc)][:12]


def _download_thumbnail(url: str, outdir: Path, video_id: str) -> Path | None:
    """Télécharge la miniature distante si yt-dlp n'a rien écrit sur disque."""
    dest = outdir / f"{video_id}.jpg"
    try:
        resp = httpx.get(url, headers=DEFAULT_HEADERS, timeout=30, follow_redirects=True)
        if resp.status_code == 200 and len(resp.content) > 1000:
            dest.write_bytes(resp.content)
            return dest
    except Exception as exc:  # noqa: BLE001
        logger.warning("Miniature distante indisponible : %s", exc)
    return None


def fetch_links(urls: list[str]) -> list[dict]:
    """Télécharge chaque URL dans storage/temp et renvoie les métadonnées.

    Chaque élément : {id, url, title, thumbnail, video, duration, view_count, hashtags, status}
    avec thumbnail/video = chemins relatifs servables sous /storage.
    """
    settings = get_settings()
    results: list[dict] = []

    for raw_url in urls:
        url = raw_url.strip()
        if not url:
            continue
        folder = uuid.uuid4().hex[:10]
        outdir = settings.wizard_dir / folder
        outdir.mkdir(parents=True, exist_ok=True)

        try:
            with yt_dlp.YoutubeDL(_ydl_opts(outdir)) as ydl:
                info = ydl.extract_info(url, download=True)

            video_id = info.get("id", "video")
            files = list(outdir.glob(f"{video_id}.*"))
            video_files = [p for p in files if p.suffix.lower() in VIDEO_SUFFIXES]
            if not video_files:
                # fallback : n'importe quel fichier média du dossier
                video_files = [p for p in outdir.iterdir() if p.suffix.lower() in VIDEO_SUFFIXES]
            if not video_files:
                raise RuntimeError(f"Aucun fichier vidéo téléchargé pour {url}")

            video_path = max(video_files, key=lambda p: p.stat().st_size)
            thumb_files = [p for p in outdir.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES]
            thumb_path = max(thumb_files, key=lambda p: p.stat().st_size) if thumb_files else None
            if thumb_path is None and info.get("thumbnail"):
                thumb_path = _download_thumbnail(info["thumbnail"], outdir, video_id)

            rel = lambda p: str(Path("temp") / folder / p.name)  # noqa: E731
            results.append(
                {
                    "id": folder,
                    "url": info.get("webpage_url") or url,
                    "title": info.get("title"),
                    "thumbnail": rel(thumb_path) if thumb_path else None,
                    "video": rel(video_path),
                    "duration": float(info["duration"]) if info.get("duration") else None,
                    "view_count": int(info["view_count"]) if info.get("view_count") else None,
                    "hashtags": _extract_hashtags(info),
                    "status": "ready",
                }
            )
            logger.info("Lien importé : %s (%s)", url, video_path.name)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Échec import %s : %s", url, exc)
            results.append(
                {
                    "id": folder,
                    "url": url,
                    "title": None,
                    "thumbnail": None,
                    "video": None,
                    "duration": None,
                    "view_count": None,
                    "hashtags": [],
                    "status": f"error: {type(exc).__name__}: {str(exc)[:120]}",
                }
            )
    return results


async def tts_preview(text: str, voice: str) -> str:
    """Synthèse d'un échantillon -> fichier temp, renvoie le chemin relatif /storage.

    Voix ``shortly:<nom>`` → voix designée via daemon Qwen TTS (instruct par voix).
    """
    settings = get_settings()
    filename = f"preview_{uuid.uuid4().hex[:8]}"
    out_path = settings.wizard_dir / f"{filename}.mp3"

    if voice.startswith("shortly:"):
        from app.services import qwen_tts_service

        if not qwen_tts_service.is_available():
            raise RuntimeError(
                "Le daemon Qwen TTS n'est pas disponible — démarrez-le pour utiliser "
                "les voix Shortly (voir qwenTTS/)."
            )
        wav, _dur = await asyncio.to_thread(
            qwen_tts_service.synthesize,
            text,
            voice.split(":", 1)[1],
            settings.wizard_dir,
        )
        _wav_to_mp3(wav, out_path)
    else:
        from app.services import tts_service

        await tts_service.synthesize(text, out_path, voice=voice)
    return f"temp/{out_path.name}"


def _wav_to_mp3(wav_path: Path, mp3_path: Path) -> None:
    """Convertit un WAV 24 kHz en MP3 via ffmpeg (remplace le fichier cible)."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav_path), "-codec:a", "libmp3lame",
         "-qscale:a", "4", str(mp3_path)],
        capture_output=True,
        check=True,
        timeout=120,
    )


def _probe_duration(path: Path) -> float | None:
    """Durée d'un fichier audio via ffprobe (None si indisponible)."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if out.returncode == 0 and out.stdout.strip():
            return round(float(out.stdout.strip()), 1)
    except Exception:  # noqa: BLE001
        pass
    return None


def list_music_library() -> list[dict]:
    """Liste les musiques libres déposées dans backend/data/music/ (classées par catégorie)."""
    settings = get_settings()
    items: list[dict] = []
    if not settings.music_dir.exists():
        return items
    for p in sorted(settings.music_dir.iterdir()):
        if p.suffix.lower() not in (".mp3", ".wav", ".m4a", ".ogg"):
            continue
        name = p.stem
        lowered = name.lower()
        category = "Dynamique"
        for key, cat in MUSIC_CATEGORIES.items():
            if key in lowered:
                category = cat
                break
        items.append({"name": name, "category": category, "path": str(p), "duration": _probe_duration(p)})
    return items


def list_voice_samples() -> list[dict]:
    """Liste les échantillons vocaux déposés dans backend/data/voices/ (Shortly)."""
    settings = get_settings()
    items: list[dict] = []
    if not settings.voices_dir.exists():
        return items
    for p in sorted(settings.voices_dir.iterdir()):
        if p.suffix.lower() not in (".mp3", ".wav", ".m4a", ".ogg"):
            continue
        items.append({"name": p.stem, "file": p.name, "duration": _probe_duration(p)})
    return items
