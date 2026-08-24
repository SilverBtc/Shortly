# TikTok Studio — Installation locale (Qwen3-TTS, voix design)

Machine cible : **i5-14400 / 32 Go RAM / RX 9070 XT** (Linux ou WSL2 recommandé).
Le daemon vocal Qwen3-TTS tourne en **100 % local**.

> ✅ **Setup Windows + WSL2 validé**.
> Le GPU AMD est utilisable via ROCm/WSL (`qwenTTS/start_voicedesign_gpu.sh`) ;
> sinon le daemon tourne en **CPU float32** (`--device cpu --dtype float32`).

---

## 1. Prérequis

- **Linux** (natif) ou **WSL2** (Windows) — le ROCm AMD ne marche pas en Windows natif
- **Python 3.12** (`python3 --version`)
- **Node 20+** + **pnpm** (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Git**, **ffmpeg**

---

## 2. Modèles Qwen3-TTS (~4 Go)

Les modèles se téléchargent automatiquement depuis Hugging Face au premier
démarrage du daemon (`Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`).

Copie optionnelle du cache HF Windows → WSL (ext4 = chargement plus rapide) :

```bash
./scripts/copy_qwen_models.sh
```

---

## 3. Daemon Qwen3-TTS (voix design) — port 7863

```bash
cd tiktok-studio-local/qwenTTS

python -m venv qwen_env && source qwen_env/bin/activate

# GPU AMD (RX 9070 XT) — ROCm :
pip install torch torchaudio --index-url https://download.pytorch.org/whl/rocm7.2

# CPU pur (fallback, lent) :
#   pip install torch torchaudio

pip install transformers==5.15.1 accelerate fastapi uvicorn numpy soundfile httpx
pip install -e ./Qwen3-TTS   # paquet qwen_tts (editable)
```

Démarrage :

```bash
# GPU (recommandé) :
./start_voicedesign_gpu.sh

# CPU :
qwen_env/bin/python qwen_server.py --device cpu --dtype float32 --port 7863
```

Attente : **~2 min** de chargement (log `[qwen_server] Modèle prêt`).

Vérif :
```bash
curl http://127.0.0.1:7863/health
# {"status":"ok","model_loaded":true,"sample_rate":24000,...}
```

> Les voix Shortly (`backend/data/voices/*.mp3`) sont jouées en pré-écoute dans
> l'UI ; au rendu, chaque voix mappe vers un **instruct descriptif** envoyé au
> daemon VoiceDesign (`SHORTLY_INSTRUCTS` dans `backend/app/services/qwen_tts_service.py`).

---

## 4. Backend API — port 8000

```bash
cd tiktok-studio-local/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export TIKTOK_CORS_ORIGINS='["http://localhost:3000","http://127.0.0.1:3000"]'
export TIKTOK_PUBLIC_BASE_URL='http://127.0.0.1:8000'
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Le backend appelle le daemon Qwen sur `http://127.0.0.1:7863`
(`backend/app/services/qwen_tts_service.py`).

---

## 5. Frontend — port 3000

```bash
cd tiktok-studio-local/frontend
pnpm install
NEXT_PUBLIC_API_URL='http://127.0.0.1:8000' pnpm exec next dev -H 0.0.0.0 -p 3000
```

Ouvrir **http://localhost:3000** → Wizard `/wizard` (import de liens → hook →
réglages → script IA → rendu + voix Shortly).

---

## 6. Ordre de lancement

1. **Daemon Qwen TTS** (2 min de chargement) → `qwenTTS/start_voicedesign_gpu.sh`
2. **Backend** → `uvicorn app.main:app --port 8000`
3. **Frontend** → `pnpm exec next dev -p 3000`

Scripts tout-en-un : `start_all.bat` (Windows) ou `scripts/run_all.sh` (WSL/Linux).

---

## Notes GPU AMD (RX 9070 XT / RDNA4)

- ROCm officiel PyTorch : `pip install torch --index-url https://download.pytorch.org/whl/rocm7.2`
- Sous WSL, `LD_PRELOAD=/opt/rocm/lib/libhsa-runtime64.so` est obligatoire
  (la lib HSA du wheel torch ne supporte pas dxg ; géré par `start_voicedesign_gpu.sh`).
- Vérif : `python -c "import torch; print(torch.cuda.is_available())"` → `True`.
- Sans ROCm, le daemon tourne en CPU : **lent** (plusieurs min pour quelques
  secondes d'audio) — le GPU est fortement recommandé.
