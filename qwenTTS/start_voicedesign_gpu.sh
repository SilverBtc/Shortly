#!/bin/bash
# Daemon Qwen3-TTS VoiceDesign sur GPU AMD (ROCm/WSL) — port 7863.
# qwenTTS/qwen_env : transformers + torch ROCm installés en propre dans le venv.
# LD_PRELOAD obligatoire : la lib HSA embarquée du wheel torch ne supporte pas
# WSL (dxg) ; celle d'/opt/rocm si. Sans elle, torch.cuda.is_available() = False.
export LD_PRELOAD=/opt/rocm/lib/libhsa-runtime64.so
cd "$(dirname "$0")"
exec qwen_env/bin/python qwen_server.py \
  --model Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign \
  --device cuda --dtype bfloat16 --no-flash-attn \
  --ip 0.0.0.0 --port 7863
