# 🎬 TikTok Studio

Génération de vidéos courtes (TikTok/Shorts) **100 % locale** : import de liens, script IA,
voix de synthèse Qwen3-TTS (voice design / clonage), rendu vidéo Remotion.

Le daemon vocal **Qwen3-TTS** tourne sur votre **GPU AMD (ROCm)** ou en CPU de secours.
Aucun appel à un service cloud : tout passe par **Ollama** (LLM) et **Qwen3-TTS** (voix).

---

## 🏗️ Architecture — 3 services

| Service | Techno | Port | Rôle |
|---|---|---|---|
| **Daemon TTS** | Qwen3-TTS (1.7B VoiceDesign) | `7863` | Synthèse vocale (GPU AMD ROCm) |
| **Backend API** | FastAPI + SQLite | `8000` | Orchestration, LLM, scraping, rendu |
| **Frontend** | Next.js 15 + Remotion | `3000` | Wizard de création (`/wizard`) |

```
Frontend (3000) ──▶ Backend (8000) ──▶ Daemon Qwen3-TTS (7863) ──▶ GPU AMD (ROCm)
                        │
                        └──▶ Ollama (11434) : script IA
```

---

## 📋 Prérequis

| Outil | Version | Notes |
|---|---|---|
| **Linux ou WSL2** | — | Le ROCm AMD ne fonctionne pas en Windows natif |
| **Python** | 3.10 – 3.13 | Testé avec 3.12 (WSL) |
| **Node.js** | 20+ | + pnpm (`corepack enable`) |
| **Git** | — | |
| **ffmpeg** | — | Pour le traitement audio/vidéo |
| **Ollama** | optionnel | LLM local (`ollama pull qwen2.5:7b`) pour le script IA |

> 💡 **GPU AMD** : installez le runtime **ROCm** dans WSL (voir [GPU AMD](#-gpu-amd-rocm)).

---

## 🚀 Quick start

```bash
# 1️⃣ Daemon TTS (WSL/Linux) — installation automatique (~4 Go, 1 fois)
cd qwenTTS
./setup.sh          # détecte ROCm → GPU, sinon CPU

# 2️⃣ Backend (WSL/Linux)
cd ../backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # valeurs par défaut locales
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 3️⃣ Frontend (n'importe où)
cd ../frontend
pnpm install
pnpm dev
```

Puis ouvrez **http://localhost:3000/wizard** 🎉

> ⚠️ **Ordre** : attendez `[qwen_server] Modèle prêt` (1–2 min au 1er démarrage, téléchargement
> du modèle ~4 Go) avant de générer des voix depuis l'UI.

---

## 🔧 Installation détaillée

### 1. Daemon TTS (`qwenTTS/`) — port 7863

```bash
cd qwenTTS
./setup.sh          # ou ./setup.sh --gpu / --cpu pour forcer
```

Le script `setup.sh` :
1. crée le venv `qwenTTS/venv`,
2. installe **PyTorch ROCm** depuis l'index dédié PyTorch (GPU AMD) — ou PyTorch CPU sinon,
3. installe les dépendances + le paquet local `qwen_tts` (clone auto du dépôt Qwen officiel si absent),
4. vérifie `torch.cuda.is_available()`.

Lancement :

```bash
venv/bin/python qwen_server.py
# Forcer un device : --device cuda --dtype bfloat16  ou  --device cpu --dtype float32
```

Vérification :

```bash
curl http://127.0.0.1:7863/health
# {"status":"ok","model_loaded":true,"device":"cuda:0",...}
```

### 2. Backend (`backend/`) — port 8000

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

> Le venv backend est **Linux** (WSL) : activez-le dans WSL (`source venv/bin/activate`), jamais dans PowerShell Windows (`venv/Scripts/Activate.ps1` n'existe pas ici).

### 3. Frontend (`frontend/`) — port 3000

```bash
cd frontend
pnpm install
pnpm dev            # → http://localhost:3000
```

---

## 🎮 GPU AMD (ROCm)

PyTorch ROCm est installé **exclusivement** depuis l'index dédié
(`--index-url https://download.pytorch.org/whl/rocm7.2`) — ne pas utiliser
`--extra-index-url`, qui résout vers le wheel CUDA/NVIDIA de PyPI et ignore le GPU AMD.

| Point | Détail |
|---|---|
| Wheel | `torch==2.13.0+rocm7.2`, `torchaudio==2.11.0+rocm7.2` |
| Compatibilité | RX 9070 XT (RDNA4) validée — WSL2 |
| `LD_PRELOAD` | posé automatiquement par `qwen_server.py` (`libhsa-runtime64.so`) |
| Vérification | `venv/bin/python -c "import torch; print(torch.cuda.is_available())"` → `True` |
| Sans GPU | `./setup.sh --cpu` — fonctionne, mais **lent** (GPU fortement recommandé) |

---

## 🛠️ Dépannage

| Problème | Solution |
|---|---|
| `No matching distribution found for torch==2.13.0+rocm7.2` | Installez via l'index ROCm **exclusif** : `pip install torch torchaudio --index-url https://download.pytorch.org/whl/rocm7.2` |
| `torch.cuda.is_available()` → `False` sur GPU AMD | ROCm absent de WSL : `wsl --update`, puis installez le runtime ROCm ; vérifiez `/opt/rocm/lib/libhsa-runtime64.so` |
| Génération très lente | Le modèle est en CPU : relancez avec `--device cuda --dtype bfloat16` |
| `[qwen_server]` muet pendant 2 min | Normal : chargement du modèle au 1er lancement (téléchargement ~4 Go) |
| Voix robotiques / erreur 500 sur `/generate` | Vérifiez le message d'erreur ; le daemon doit être prêt (`model_loaded: true`) |

---

## 🗂️ Structure

```
tiktok-studio-local/
├── qwenTTS/            # Daemon Qwen3-TTS (voice design) — venv + serveur
│   ├── qwen_server.py  # API FastAPI /generate + /health
│   ├── setup.sh        # Installation auto (GPU ROCm / CPU)
│   └── demo_dynamic.py # Démos : voice clone (7861), custom voice (7862)
├── backend/            # API FastAPI (scraping, LLM, TTS, rendu, workers)
└── frontend/           # Next.js 15 + Remotion (wizard /wizard)
```

---

## 📄 Licence

Ce projet est sous **Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0)** :

- ✅ **Gratuit** pour un usage personnel / non commercial (partage, modification, crédit à l'auteur)
- 💰 **Payant** pour tout usage commercial (monétisation de contenu créé avec le logiciel, revente, intégration dans un produit commercial…) — licence commerciale à obtenir auprès de l'auteur

Voir [`LICENSE`](LICENSE) — [Texte officiel CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.fr)

> Ce projet intègre [Qwen3-TTS](https://github.com/Qwen/Qwen3-TTS) (Apache-2.0, © Alibaba) dont les conditions s'appliquent indépendamment.
