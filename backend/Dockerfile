# Backend FastAPI — TikTok Studio
# Image python 3.11 + node 20 (Remotion CLI appelée en sous-processus par le backend)
FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 python3-venv python3-pip ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances Python dans un venv (PEP 668 sur bookworm)
COPY requirements.txt .
RUN python3 -m venv /venv \
    && /venv/bin/pip install --no-cache-dir --upgrade pip \
    && /venv/bin/pip install --no-cache-dir -r requirements.txt

# Sources backend
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

EXPOSE 8000

CMD ["/venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
