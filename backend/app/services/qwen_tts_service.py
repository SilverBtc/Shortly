"""Service client Qwen3-TTS VoiceDesign (daemon local qwen_server.py).

Le modèle VoiceDesign tourne dans un daemon séparé (qwenTTS/qwen_server.py)
pour rester chargé en mémoire. Ce module expose une API propre au backend
principal : disponibilité, synthèse avec instruct de design vocal.
Voix Shortly (``shortly:<nom>``) : chaque nom mappe vers un instruct descriptif
envoyé au daemon.
Si le daemon n'est pas joignable, les appelants doivent lever une erreur claire.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

QWEN_DAEMON_URL = "http://127.0.0.1:7863"
QWEN_TIMEOUT_S = 60 * 30  # génération CPU lente : 30 min max

_cache_available: Optional[bool] = None

# Voix Shortly (backend/data/voices/<nom>.mp3) → instruct descriptif envoyé au
# daemon Qwen VoiceDesign.
SHORTLY_INSTRUCTS: dict[str, str] = {
    "antoine": "voix masculine française grave et posée, débit calme, ton documentaire",
    "hugo": "voix masculine française jeune et énergique, rythme rapide, ton YouTube",
    "marie": "voix féminine française chaleureuse et claire, articulation nette, ton amical",
    "maxime": "voix masculine française dynamique, articulation punchy, ton motivant",
    "nicolas": "voix masculine française neutre et professionnelle, diction précise, ton journaliste",
    "paul": "voix masculine française douce et posée, débit lent, ton narrateur",
}

# Langues acceptées par Qwen3-TTS VoiceDesign.
_LANG_CODES = {
    "auto": "auto", "chinese": "chinese", "mandarin": "chinese",
    "english": "english", "anglais": "english", "en": "english",
    "french": "french", "français": "french", "francais": "french", "fr": "french",
    "german": "german", "allemand": "german", "de": "german",
    "italian": "italian", "italien": "italian", "it": "italian",
    "japanese": "japanese", "japonais": "japanese", "ja": "japanese",
    "korean": "korean", "coréen": "korean", "coreen": "korean", "ko": "korean",
    "portuguese": "portuguese", "portugais": "portuguese", "pt": "portuguese",
    "russian": "russian", "russe": "russian", "ru": "russian",
    "spanish": "spanish", "espagnol": "spanish", "es": "spanish",
}


def _norm_language(language: str | None) -> str | None:
    """Normalise un label de langue ("Français", "fr"…) en code modèle ("french")."""
    if not language or not language.strip():
        return None
    key = language.strip().lower()
    return _LANG_CODES.get(key, "auto")


def is_shortly(voice_id: str) -> bool:
    """True si voice_id désigne une voix Shortly ("shortly:<nom>")."""
    return voice_id.startswith("shortly:")


def shortly_instruct(voice_name: str) -> str:
    """Instruct Qwen pour une voix Shortly ("antoine" ou "shortly:antoine")."""
    name = voice_name.split(":", 1)[1] if ":" in voice_name else voice_name
    try:
        return SHORTLY_INSTRUCTS[name]
    except KeyError as exc:
        raise ValueError(f"Voix Shortly inconnue : {name!r}") from exc


def synthesize(text: str, voice_name: str, output_dir: Path) -> tuple[Path, float]:
    """Génère la voix Shortly ``voice_name`` → WAV dans output_dir.

    Retourne (chemin du WAV, durée en secondes).
    """
    wav, duration = generate(
        text, instruct=shortly_instruct(voice_name), output_dir=output_dir, language="fr"
    )
    return wav, duration


def is_available() -> bool:
    """True si le daemon Qwen répond /health avec un modèle chargé."""
    global _cache_available
    try:
        r = httpx.get(f"{QWEN_DAEMON_URL}/health", timeout=3)
        ok = r.status_code == 200 and r.json().get("model_loaded") is True
    except Exception as exc:  # noqa: BLE001
        logger.debug("daemon qwen injoignable: %s", exc)
        ok = False
    _cache_available = ok
    return ok


def generate(
    text: str,
    instruct: str,
    output_dir: Path,
    language: str | None = None,
    temperature: float = 0.9,
    top_p: float = 0.95,
    top_k: int = 50,
    repetition_penalty: float = 1.05,
    subtalker_temperature: float | None = None,
    subtalker_top_p: float | None = None,
    subtalker_top_k: int | None = None,
) -> tuple[Path, float]:
    """Génère la voix designée → WAV copié dans output_dir.

    Retourne (chemin du WAV, durée en secondes). Soulève une exception si le
    daemon est indisponible ou si la génération échoue.
    """
    payload = {
        "text": text,
        "instruct": instruct,
        "language": _norm_language(language),
        "temperature": temperature,
        "top_p": top_p,
        "top_k": top_k,
        "repetition_penalty": repetition_penalty,
        "subtalker_temperature": subtalker_temperature,
        "subtalker_top_p": subtalker_top_p,
        "subtalker_top_k": subtalker_top_k,
    }
    r = httpx.post(f"{QWEN_DAEMON_URL}/generate", json=payload, timeout=QWEN_TIMEOUT_S)
    if r.status_code == 429:
        raise RuntimeError("génération Qwen déjà en cours — réessayer plus tard")
    r.raise_for_status()

    data = r.json()
    wav_path = Path(data["audio_path"])
    if not wav_path.exists():
        raise RuntimeError("le daemon a répondu sans produire de fichier audio")

    output_dir.mkdir(parents=True, exist_ok=True)
    dest = output_dir / wav_path.name
    if dest.resolve() != wav_path.resolve():
        shutil.copyfile(wav_path, dest)
    return dest, float(data.get("duration_s", 0.0))


def wait_until_ready(timeout_s: float = 300.0) -> bool:
    """Attend que le daemon soit prêt (après démarrage du modèle)."""
    import time

    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout_s:
        if is_available():
            return True
        time.sleep(5)
    return False


def wav_to_mp3(wav_path: Path, mp3_path: Path) -> Path:
    """Convertit un WAV en MP3 via ffmpeg (remplace le fichier cible)."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav_path), "-codec:a", "libmp3lame",
         "-qscale:a", "4", str(mp3_path)],
        capture_output=True,
        check=True,
        timeout=120,
    )
    return mp3_path


def new_audio_name(prefix: str = "qwen_vd") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"
