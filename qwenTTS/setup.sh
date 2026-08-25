#!/usr/bin/env bash
# ============================================================
#  Setup du daemon Qwen3-TTS (GPU AMD ROCm par défaut, sinon CPU)
#  Usage :
#    ./setup.sh          # auto-détection (GPU ROCm si dispo, sinon CPU)
#    ./setup.sh --gpu    # force ROCm (GPU AMD)
#    ./setup.sh --cpu    # force CPU
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
VENV_DIR="venv"
MODE="${1:-auto}"

echo "==> Python : $("$PYTHON" --version)"

# --- 1. venv -------------------------------------------------
if [ ! -d "$VENV_DIR" ]; then
  echo "==> Création du venv : $VENV_DIR"
  "$PYTHON" -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
pip install --quiet --upgrade pip

# --- 2. torch : GPU AMD ROCm ou CPU --------------------------
if [ "$MODE" = "auto" ]; then
  # /opt/rocm est le meilleur indicateur sur Linux/WSL (lspci souvent absent sous WSL)
  if [ -d /opt/rocm ]; then
    MODE=gpu
  else
    MODE=cpu
  fi
fi

if [ "$MODE" = "gpu" ]; then
  echo "==> Installation PyTorch ROCm (GPU AMD)…  (~3 Go à télécharger)"
  pip install -r requirements-gpu.txt
else
  echo "==> Installation PyTorch CPU…"
  pip install -r requirements-cpu.txt
fi

# Le reste des dépendances vient de PyPI (l'index ROCm ne contient que torch/torchaudio)
pip install -r requirements.txt

# --- 3. Paquet local Qwen3-TTS (editable) --------------------
if [ ! -d Qwen3-TTS ]; then
  echo "==> Clonage du dépôt officiel Qwen3-TTS…"
  git clone --depth 1 https://github.com/Qwen/Qwen3-TTS.git
fi
echo "==> Installation du paquet local qwen_tts…"
pip install --quiet -e ./Qwen3-TTS

# --- 4. Vérification ------------------------------------------
echo "==> Vérification :"
"$VENV_DIR/bin/python" -c "import torch; print('  torch', torch.__version__, '| CUDA dispo :', torch.cuda.is_available())"

echo ""
echo "✅ Setup terminé ! Lancement du daemon :"
echo "   $VENV_DIR/bin/python qwen_server.py"
