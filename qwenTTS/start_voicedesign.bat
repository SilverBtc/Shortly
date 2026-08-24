@echo off
REM Daemon Qwen3-TTS VoiceDesign (1.7B) - port 7863
REM CPU float32 recommande (comme demo_dynamic.py)
cd /d "%~dp0"
python qwen_server.py --model Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign --device cpu --dtype float32 --no-flash-attn --ip 127.0.0.1 --port 7863
