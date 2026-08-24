"""Fixtures pytest — environnement isolé (SQLite temporaire) + client HTTP."""
from __future__ import annotations

import os
import tempfile

# IMPORTANT : les variables d'environnement DOIVENT être posées avant l'import de l'app
_TMP = tempfile.mkdtemp(prefix="tiktok_test_")
os.environ["TIKTOK_DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP}/test.db"
os.environ["TIKTOK_DATA_DIR"] = os.path.join(_TMP, "data")
os.environ["TIKTOK_STORAGE_DIR"] = os.path.join(_TMP, "storage")
os.environ["TIKTOK_LLM_BASE_URL"] = "http://llm-test.invalid/v1"
os.environ["TIKTOK_LLM_API_KEY"] = "test-key"
os.environ["TIKTOK_LLM_MODEL"] = "test-model"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.workers import task_queue  # noqa: E402


@pytest.fixture()
def client():
    """Client FastAPI avec lifespan actif (init_db + worker démarré)."""
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def fake_handlers(client, monkeypatch):
    """Remplace les handlers réseaux par des fakes déterministes."""

    async def fake_scrape(payload, job_id):
        return {"items": []}

    async def fake_spy(payload, job_id):
        return {"text": "transcription test", "transcript": [], "scripts": ["S1", "S2", "S3"]}

    monkeypatch.setitem(task_queue.HANDLERS, "scrape", fake_scrape)
    monkeypatch.setitem(task_queue.HANDLERS, "spy", fake_spy)
    return task_queue.HANDLERS
