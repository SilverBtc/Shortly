#!/usr/bin/env bash
# Lance le trio TikTok Studio : daemon Qwen TTS (7863) + backend (8000) + frontend (3000)
# Usage : ./run_all.sh            (tout)
#         ./run_all.sh qwen       (daemon seul — GPU via start_voicedesign_gpu.sh)
#         ./run_all.sh backend    (backend seul)
#         ./run_all.sh frontend   (frontend seul)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

start_qwen() {
  echo "▶ Daemon Qwen3-TTS VoiceDesign (7863)"
  exec bash "$ROOT/qwenTTS/start_voicedesign_gpu.sh"
}

start_backend() {
  echo "▶ Backend API (8000)"
  cd "$ROOT/backend"
  source .venv/bin/activate
  export TIKTOK_CORS_ORIGINS='["http://localhost:3000","http://127.0.0.1:3000"]'
  export TIKTOK_PUBLIC_BASE_URL='http://127.0.0.1:8000'
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
}

start_frontend() {
  echo "▶ Frontend Next.js (3000)"
  cd "$ROOT/frontend"
  export NEXT_PUBLIC_API_URL='http://127.0.0.1:8000'
  exec pnpm exec next dev -H 0.0.0.0 -p 3000
}

case "$MODE" in
  qwen) start_qwen ;;
  backend) start_backend ;;
  frontend) start_frontend ;;
  all)
    echo "Lancez les 3 commandes dans 3 terminaux :"
    echo "  $0 qwen      # daemon (attendre '[qwen_server] Modèle prêt')"
    echo "  $0 backend"
    echo "  $0 frontend"
    ;;
esac
