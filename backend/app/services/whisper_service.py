"""Service de transcription faster-whisper avec word-level timestamps."""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class WhisperService:
    """Wrapper lazy autour de faster-whisper (un modèle chargé par (taille, device))."""

    def __init__(self) -> None:
        self._models: dict[str, object] = {}

    def _key(self, model_size: str, device: str) -> str:
        return f"{model_size}:{device}"

    def _get_model(self, model_size: str, device: str):
        key = self._key(model_size, device)
        if key not in self._models:
            from faster_whisper import WhisperModel  # import localisé : téléchargement au 1er usage

            compute_type = "float16" if device == "cuda" else "int8"
            settings = get_settings()
            logger.info(
                "Chargement du modèle whisper %s (device=%s, compute_type=%s)",
                model_size,
                device,
                compute_type,
            )
            self._models[key] = WhisperModel(
                model_size,
                device=device,
                compute_type=compute_type,
                download_root=str(settings.data_dir / "models"),
            )
        return self._models[key]

    def _transcribe_sync(self, audio_path: Path, model_size: str, device: str, language: str) -> tuple[list[dict], float | None]:
        model = self._get_model(model_size, device)
        segments, info = model.transcribe(
            str(audio_path),
            language=language,
            word_timestamps=True,
            vad_filter=True,
            beam_size=5,
        )
        words: list[dict] = []
        for segment in segments:
            for word in segment.words:
                words.append(
                    {
                        "word": word.word.strip(),
                        "start": round(word.start, 3),
                        "end": round(word.end, 3),
                    }
                )
        duration = info.duration if info is not None else None
        return words, duration

    async def transcribe(
        self,
        audio_path: Path,
        model_size: str = "base",
        device: str = "cpu",
        language: str = "fr",
    ) -> tuple[list[dict], float | None]:
        """Transcrit un fichier audio et renvoie (words, duration_seconds)."""
        logger.info("Transcription whisper (%s/%s) : %s", model_size, device, audio_path)
        return await asyncio.to_thread(
            self._transcribe_sync, Path(audio_path), model_size, device, language
        )


whisper_service = WhisperService()
