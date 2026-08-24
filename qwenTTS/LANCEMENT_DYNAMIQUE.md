# Qwen TTS Dynamique - 2 modèles

## 0. VoiceDesign 1.7B (daemon API pour l'onglet "Voice Design" du studio) - port 7863
Lancement: `start_voicedesign.bat` ou `python qwen_server.py --device cpu --dtype float32 --no-flash-attn --port 7863`
- Utilisé par le backend FastAPI (`/api/voice-design/*`) : le LLM génère script + instruct + params, puis ce daemon synthétise l'audio.
- Health check: http://127.0.0.1:7863/health

## 1. Base 1.7B Voice Clone (ton clone) - DYNAMIQUE PATCHÉ
Port 7861 - http://127.0.0.1:7861
- Sliders: Temperature, Subtalker Temp, Top-p, Top-k, Repetition Penalty
- Recommandé TikTok: Temp 1.10-1.15, Sub 1.05-1.08, Top-p 0.95
Lancement: `python demo_dynamic.py Qwen/Qwen3-TTS-12Hz-1.7B-Base --device cpu --dtype float32 --no-flash-attn --ip 127.0.0.1 --port 7861`
Fichier: demo_dynamic.py

## 2. CustomVoice 1.7B (voix preset + instruct)
Port 7862 - http://127.0.0.1:7862
Speakers: Aiden, Dylan, Eric, Ono_anna, Ryan, Serena, Sohee, Uncle_fu, Vivian
Instruct libre: "Speak with urgent confessional tone, fast TikTok style"
Lancement: `python -m qwen_tts.cli.demo Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice --device cpu --dtype float32 --no-flash-attn --ip 127.0.0.1 --port 7862`

## Ne pas lancer les 2 en même temps si <16GB RAM libre (ici 32GB OK mais 14GB utilisés)
Si ça rame: kill un des deux: taskkill /PID <id> /F
