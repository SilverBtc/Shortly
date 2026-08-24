"""Service de scraping TikTok via yt-dlp (sans filigrane, flux bruts)."""
from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path

import httpx
import yt_dlp

from app.core.config import get_settings
from app.services import browser_scraper

logger = logging.getLogger(__name__)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    )
}


def _cookies_file() -> Path | None:
    """Cookies TikTok exportés (Netscape format) — backend/data/tiktok_cookies.txt.
    Débloque le scraping hashtag/API quand TikTok bloque l'IP serveur."""
    path = get_settings().data_dir / "tiktok_cookies.txt"
    return path if path.exists() else None


def _profile_url(username: str) -> str:
    return f"https://www.tiktok.com/@{username.lstrip('@')}"


def _hashtag_url(hashtag: str) -> str:
    return f"https://www.tiktok.com/tag/{hashtag.lstrip('#')}"


def _search_url(query: str) -> str:
    return f"https://www.tiktok.com/search/video?q={query}"


def resolve_url(source_type: str, query: str) -> str:
    if source_type == "profile":
        return _profile_url(query)
    if source_type == "hashtag":
        return _hashtag_url(query)
    return query


def _base_opts(outdir: Path) -> dict:
    opts = {
        "outtmpl": str(outdir / "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "http_headers": DEFAULT_HEADERS,
        "socket_timeout": 20,
    }
    cookies = _cookies_file()
    if cookies is not None:
        opts["cookiefile"] = str(cookies)
        logger.info("Cookies TikTok utilisés : %s", cookies)
    return opts


def _find_thumbnail(outdir: Path, video_id: str) -> Path | None:
    """Cherche la miniature téléchargée à côté de la vidéo."""
    for ext in ("jpg", "jpeg", "webp", "png"):
        candidate = outdir / f"{video_id}.{ext}"
        if candidate.exists():
            return candidate
    # fallback: tout fichier commençant par l'id
    matches = sorted(outdir.glob(f"{video_id}.*"))
    for m in matches:
        if m.suffix.lower() in (".jpg", ".jpeg", ".webp", ".png"):
            return m
    return None


async def _download_thumbnail(url: str, outdir: Path, video_id: str) -> Path | None:
    """Télécharge une miniature via httpx si yt-dlp ne l'a pas fait."""
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=DEFAULT_HEADERS) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        ext = Path(url.split("?")[0]).suffix.lower() or ".jpg"
        if ext not in (".jpg", ".jpeg", ".webp", ".png"):
            ext = ".jpg"
        thumb = outdir / f"{video_id}{ext}"
        thumb.write_bytes(resp.content)
        return thumb
    except Exception as exc:  # non bloquant
        logger.warning("Miniature non téléchargée pour %s : %s", video_id, exc)
        return None


async def download_single(url: str, outdir: Path) -> dict:
    """Télécharge une vidéo TikTok individuelle -> dict prêt pour MediaAsset."""
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    opts = _base_opts(outdir)
    opts.update(
        {
            "format": "bv*[height<=1080]+ba/b[height<=1080]",
            "noplaylist": True,
            "writethumbnail": True,
        }
    )

    def _run() -> dict:
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=True)

    info = await asyncio.to_thread(_run)
    if not info or info.get("_type") == "playlist":
        raise RuntimeError(f"Impossible d'extraire la vidéo : {url}")

    video_id = info.get("id", "unknown")
    file_candidates = list(outdir.glob(f"{video_id}.*"))
    video_files = [p for p in file_candidates if p.suffix.lower() in (".mp4", ".mov", ".webm", ".mkv")]
    if not video_files:
        raise RuntimeError(f"Aucun fichier vidéo trouvé pour {video_id}")

    video_path = max(video_files, key=lambda p: p.stat().st_size)
    thumb_path = _find_thumbnail(outdir, video_id)
    if thumb_path is None and info.get("thumbnail"):
        thumb_path = await _download_thumbnail(info["thumbnail"], outdir, video_id)

    return {
        "source_url": info.get("webpage_url") or url,
        "file_path": str(video_path),
        "thumbnail_path": str(thumb_path) if thumb_path else None,
        "title": info.get("title"),
        "duration": float(info["duration"]) if info.get("duration") else None,
        "status": "pending",
    }


async def scrape_entries(source_type: str, query: str, limit: int, outdir: Path) -> list[dict]:
    """Scrape jusqu'à `limit` vidéos depuis un profil, un hashtag ou une URL unique."""
    url = resolve_url(source_type, query)
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    if source_type == "url":
        item = await download_single(url, outdir)
        return [item]

    # Profil / hashtag : extraction plate de la playlist, puis téléchargement individuel
    flat_opts = {
        "extract_flat": "in_playlist",
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
        "http_headers": DEFAULT_HEADERS,
        "socket_timeout": 20,
    }

    def _extract_flat() -> dict:
        with yt_dlp.YoutubeDL(flat_opts) as ydl:
            return ydl.extract_info(url, download=False)

    info = await asyncio.to_thread(_extract_flat)
    entries = []
    if info is not None:
        entries = info.get("entries") or []
        if not entries and info.get("id"):
            entries = [info]

    results: list[dict] = []

    # Hashtag : si yt-dlp (API) ne donne rien, fallback navigateur headless
    # (TikTok exige une signature X-Bogus générée côté client sur les pages tag).
    if source_type == "hashtag" and not entries:
        logger.warning("yt-dlp n'a rien extrait pour %s — tentative navigateur headless", url)
        try:
            urls = await asyncio.to_thread(
                browser_scraper.scrape_hashtag_urls, query, max(limit, 1)
            )
        except Exception as exc:
            raise RuntimeError(
                f"Scraping hashtag impossible : yt-dlp a échoué ({type(exc).__name__}) "
                "et le fallback navigateur n'a rien trouvé. TikTok exige une session "
                "navigateur signée ; déposez vos cookies dans backend/data/tiktok_cookies.json."
            ) from exc
        for entry_url in urls:
            if len(results) >= limit:
                break
            try:
                results.append(await download_single(entry_url, outdir))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Échec téléchargement %s : %s", entry_url, exc)
                continue
        return results

    if info is None:
        raise RuntimeError(
            f"yt-dlp n'a rien extrait pour {url}. TikTok bloque souvent le scraping "
            "de hashtags depuis les serveurs (extracteur cassé / anti-bot). "
            "Essayez une source Profil ou une URL directe."
        )

    for entry in entries:
        if entry is None:
            continue
        if len(results) >= limit:
            break
        entry_url = entry.get("url") or entry.get("webpage_url")
        if not entry_url:
            continue
        try:
            results.append(await download_single(entry_url, outdir))
        except Exception as exc:
            logger.warning("Échec téléchargement %s : %s", entry_url, exc)
            continue
    return results


async def download_audio(url: str, outdir: Path) -> Path:
    """Extrait l'audio d'une vidéo TikTok (module Spy) -> fichier mp3."""
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    opts = _base_opts(outdir)
    opts.update(
        {
            "format": "ba/b",
            "noplaylist": True,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
        }
    )

    def _run() -> dict:
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=True)

    info = await asyncio.to_thread(_run)
    if not info:
        raise RuntimeError(f"Impossible d'extraire l'audio : {url}")

    video_id = info.get("id", "unknown")
    candidates = list(outdir.glob(f"{video_id}.*"))
    audio_files = [p for p in candidates if p.suffix.lower() in (".mp3", ".m4a", ".wav", ".ogg", ".opus")]
    if not audio_files:
        raise RuntimeError(f"Aucun fichier audio extrait pour {video_id}")
    return max(audio_files, key=lambda p: p.stat().st_size)
