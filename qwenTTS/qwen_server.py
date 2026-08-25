"""Serveur d'inférence Qwen3-TTS VoiceDesign — daemon dédié (CPU ou GPU).

Rôle : garder le modèle **Qwen3-TTS-12Hz-1.7B-VoiceDesign** chargé en mémoire
et exposer une API locale HTTP pour le backend principal FastAPI.
Process séparé, venv dédié, modèle chargé une seule fois.

Endpoints :
  GET  /health    → {"status": "ok", "model": "...", "device": "..."}
  POST /generate  → {text, instruct, language?, temperature?, top_p?,
                     top_k?, repetition_penalty?, subtalker_temperature?,
                     subtalker_top_p?, subtalker_top_k?}
                  → {audio_path, duration_s}  (WAV 24 kHz)
  Sémaphore 1 : une génération à la fois.

Usage :
  python qwen_server.py [--port 7863]   # device/dtype auto-détectés (GPU si dispo)
  # Forcer : --device cuda --dtype bfloat16  ou  --device cpu --dtype float32
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import threading
import time
import uuid
from pathlib import Path


def _ensure_rocm_preload() -> None:
    """WSL/ROCm : la lib HSA embarquée du wheel torch ne supporte pas dxg ;
    celle d'/opt/rocm si. Sans elle torch.cuda.is_available() = False.
    LD_PRELOAD doit être lu par le loader au lancement du processus : si absent,
    le processus se ré-exécute une fois avec la bonne valeur."""
    if sys.platform != "linux":
        return
    lib = "/opt/rocm/lib/libhsa-runtime64.so"
    if not Path(lib).exists():
        return
    current = os.environ.get("LD_PRELOAD", "")
    if lib in current.split(":"):
        return
    os.environ["LD_PRELOAD"] = f"{lib}:{current}" if current else lib
    os.execve(sys.executable, [sys.executable, *sys.argv], os.environ)


_ensure_rocm_preload()
import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


def _strip_punctuation(text: str) -> str:
    """Retire la ponctuation d'un texte TTS — source de pauses/blancs non voulus.

    Le modèle VoiceDesign gère la prosodie via l'instruct, pas via la
    ponctuation. On garde les apostrophes (j'ai) et traits d'union (peut-être)
    qui font partie des mots français.
    """
    text = text.replace("’", "'")
    text = re.sub(r"[.,;:!?…«»“”\"()\[\]{}–—]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+'\s*", "'", text)
    text = re.sub(r"\s*'\s+", "'", text)
    text = re.sub(r"\s*-\s*", "-", text)
    return text

OUT_DIR = Path(__file__).resolve().parent / "out"
OUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Qwen TTS VoiceDesign daemon")

_model = None
_sr = 24000
_lock = threading.Semaphore(1)


class GenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    instruct: str = Field(min_length=1, max_length=2000)
    language: str | None = None  # None => "Auto"
    temperature: float = 0.9
    top_p: float = 0.95
    top_k: int = 50
    repetition_penalty: float = 1.05
    subtalker_temperature: float | None = None
    subtalker_top_p: float | None = None
    subtalker_top_k: int | None = None


def _load_model(args) -> None:
    global _model, _sr
    from qwen_tts import Qwen3TTSModel

    dtype = torch.float32 if args.dtype == "float32" else torch.bfloat16
    attn = "flash_attention_2" if (args.flash_attn and not args.no_flash_attn) else None
    print(f"[qwen_server] Chargement {args.model} sur {args.device} dtype={args.dtype} ...")
    t0 = time.time()
    _model = Qwen3TTSModel.from_pretrained(
        args.model,
        device_map=args.device,
        dtype=dtype,
        attn_implementation=attn,
    )
    try:
        _sr = int(_model.model.config.sample_rate)
    except Exception:
        _sr = 24000
    print(f"[qwen_server] Modèle prêt en {time.time() - t0:.1f}s (sr={_sr})")


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "sample_rate": _sr,
        "device": str(getattr(_model, "device", "unknown")) if _model else None,
    }


@app.post("/generate")
async def generate(req: GenerateRequest) -> dict:
    if _model is None:
        raise HTTPException(status_code=503, detail="modèle non chargé")
    if not req.text.strip():
        raise HTTPException(status_code=422, detail="text vide")
    if not req.instruct.strip():
        raise HTTPException(status_code=422, detail="instruct vide")

    kwargs: dict = {}
    if req.subtalker_temperature is not None:
        kwargs["subtalker_temperature"] = req.subtalker_temperature
    if req.subtalker_top_p is not None:
        kwargs["subtalker_top_p"] = req.subtalker_top_p
    if req.subtalker_top_k is not None:
        kwargs["subtalker_top_k"] = req.subtalker_top_k

    acquired = _lock.acquire(timeout=0.1)
    if not acquired:
        raise HTTPException(status_code=429, detail="génération déjà en cours — réessayer plus tard")
    try:
        t0 = time.time()
        wavs, sr = _model.generate_voice_design(
            text=_strip_punctuation(req.text.strip()),
            language=req.language or "Auto",
            instruct=req.instruct.strip(),
            temperature=req.temperature,
            top_p=req.top_p,
            top_k=req.top_k,
            repetition_penalty=req.repetition_penalty,
            max_new_tokens=4096,
            **kwargs,
        )
        elapsed = time.time() - t0

        wav = wavs[0]
        audio_id = f"vd_{uuid.uuid4().hex[:10]}"
        out_path = OUT_DIR / f"{audio_id}.wav"
        sf.write(str(out_path), wav, sr)

        duration_s = round(float(len(wav)) / float(sr), 2)
        return {
            "audio_path": str(out_path),
            "audio_id": audio_id,
            "duration_s": duration_s,
            "elapsed_s": round(elapsed, 1),
            "sample_rate": sr,
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
    finally:
        _lock.release()


def main() -> None:
    parser = argparse.ArgumentParser(description="Qwen3-TTS VoiceDesign daemon")
    parser.add_argument("--model", default="Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--dtype", default="auto", choices=["auto", "float32", "bfloat16"])
    parser.add_argument("--flash-attn", action="store_true")
    parser.add_argument("--no-flash-attn", action="store_true",
                        help="Compatibilité avec demo_dynamic.py (défaut : pas de flash attention)")
    parser.add_argument("--ip", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7863)
    args = parser.parse_args()
    if args.device == "auto":
        args.device = "cuda" if torch.cuda.is_available() else "cpu"
    if args.dtype == "auto":
        args.dtype = "bfloat16" if args.device == "cuda" else "float32"
    print(f"[qwen_server] device={args.device} dtype={args.dtype}")

    import uvicorn

    _load_model(args)
    uvicorn.run(app, host=args.ip, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
