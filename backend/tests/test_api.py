"""Tests API : health, settings, curation, projets (CRUD + assets)."""
from __future__ import annotations

import time

from app.workers import task_queue


def _wait_job(client, job_id: str, timeout: float = 8.0) -> dict:
    """Poll le job jusqu'à un statut final."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = client.get(f"/api/jobs/{job_id}")
        assert resp.status_code == 200, resp.text
        job = resp.json()
        if job["status"] in ("completed", "failed"):
            return job
        time.sleep(0.05)
    raise AssertionError(f"Job {job_id} toujours pas terminé après {timeout}s")


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_settings_roundtrip(client):
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    settings = resp.json()["settings"]
    assert settings["tts_voice"] == ""
    assert settings["whisper_model"] == "base"

    payload = {**settings, "llm_model": "gpt-test", "tts_voice": "shortly:hugo"}
    resp = client.put("/api/settings", json=payload)
    assert resp.status_code == 200
    assert resp.json()["settings"]["llm_model"] == "gpt-test"
    assert resp.json()["settings"]["tts_voice"] == "shortly:hugo"

    resp = client.get("/api/settings")
    assert resp.json()["settings"]["llm_model"] == "gpt-test"


def test_project_crud(client):
    # création
    resp = client.post(
        "/api/projects",
        json={"title": "Mon premier projet", "niche": "Cuisine", "script_raw": "Test [pause] script"},
    )
    assert resp.status_code == 200, resp.text
    project = resp.json()["item"]
    assert project["status"] == "draft"
    assert project["voice_id"] == "shortly:antoine"
    pid = project["id"]

    # liste
    resp = client.get("/api/projects")
    assert resp.status_code == 200
    assert any(p["id"] == pid for p in resp.json()["items"])

    # détail
    resp = client.get(f"/api/projects/{pid}")
    assert resp.status_code == 200
    assert resp.json()["item"]["id"] == pid
    assert resp.json()["assets"] == []

    # mise à jour
    resp = client.patch(f"/api/projects/{pid}", json={"status": "ready", "banner_text": "HOOK"})
    assert resp.status_code == 200
    assert resp.json()["item"]["status"] == "ready"
    assert resp.json()["item"]["banner_text"] == "HOOK"

    # suppression
    resp = client.delete(f"/api/projects/{pid}")
    assert resp.status_code == 200
    resp = client.get(f"/api/projects/{pid}")
    assert resp.status_code == 404


def test_curation_asset_lifecycle(client, fake_handlers, monkeypatch):
    """Scrape (fake) -> liste -> approbation -> lien au projet -> préparation (fake)."""
    # Fake scrape persistant un asset réel en base (comme le vrai handler)
    async def fake_scrape(payload, job_id):
        from app.core.database import SessionLocal
        from app.models.sql_models import MediaAsset

        async with SessionLocal() as db:
            asset = MediaAsset(
                source_url="https://www.tiktok.com/@test/video/1",
                file_path="/tmp/asset1.mp4",
                thumbnail_path="/tmp/thumb1.jpg",
                title="Rush de test",
                niche="Nettoyage",
                status="pending",
                duration=8.2,
            )
            db.add(asset)
            await db.commit()
            await db.refresh(asset)
            return {"items": [asset.to_dict()]}

    monkeypatch.setitem(task_queue.HANDLERS, "scrape", fake_scrape)

    resp = client.post(
        "/api/curation/scrape",
        json={"source_type": "profile", "query": "test", "limit": 1, "niche": "Nettoyage"},
    )
    assert resp.status_code == 200
    job = _wait_job(client, resp.json()["job_id"])
    assert job["status"] == "completed"
    items = job["result"]["items"]
    assert len(items) == 1
    asset_id = items[0]["id"]

    # liste avec filtre
    resp = client.get("/api/curation/assets?status=pending&niche=Nettoyage")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 1

    # approbation
    resp = client.post(f"/api/curation/assets/{asset_id}/approve")
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"

    # rejet
    resp = client.post(f"/api/curation/assets/{asset_id}/reject")
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"

    # ré-approbation pour le lier à un projet
    client.post(f"/api/curation/assets/{asset_id}/approve")

    # création projet + lien asset
    resp = client.post("/api/projects", json={"title": "Projet rush", "niche": "Nettoyage"})
    pid = resp.json()["item"]["id"]

    resp = client.post(f"/api/projects/{pid}/assets", json={"asset_id": asset_id, "is_hook": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["item"]["is_hook"] is True
    assert resp.json()["item"]["asset"]["id"] == asset_id

    # doublon refusé
    resp = client.post(f"/api/projects/{pid}/assets", json={"asset_id": asset_id})
    assert resp.status_code == 400

    # détail avec assets
    resp = client.get(f"/api/projects/{pid}")
    assert len(resp.json()["assets"]) == 1

    # retrait
    resp = client.delete(f"/api/projects/{pid}/assets/{asset_id}")
    assert resp.status_code == 200
    resp = client.get(f"/api/projects/{pid}")
    assert resp.json()["assets"] == []


def test_jobs_polling_and_404(client, fake_handlers):
    resp = client.get("/api/jobs/inexistant")
    assert resp.status_code == 404

    resp = client.get("/api/jobs")
    assert resp.status_code == 200
    assert "items" in resp.json()


def test_niches_dynamic(client):
    """La liste des niches est dynamique (GET/PUT /api/settings/niches)."""
    resp = client.get("/api/settings/niches")
    assert resp.status_code == 200
    niches = resp.json()["niches"]
    assert "Cuisine" in niches
    assert "Aviation / Pilotage" in niches  # nouvelle niche par défaut

    # PUT : liste personnalisée
    custom = ["Cuisine", "Aviation / Pilotage", "Jardinage"]
    resp = client.put("/api/settings/niches", json={"niches": custom})
    assert resp.status_code == 200
    assert resp.json()["niches"] == custom

    # Persistée au GET suivant
    resp = client.get("/api/settings/niches")
    assert resp.json()["niches"] == custom

    # Liste vide refusée
    resp = client.put("/api/settings/niches", json={"niches": []})
    assert resp.status_code in (400, 422)

    # Une niche personnalisée est acceptée dans un projet (validation permissive)
    resp = client.post("/api/projects", json={"title": "Projet jardin", "niche": "Jardinage"})
    assert resp.status_code == 200
    assert resp.json()["item"]["niche"] == "Jardinage"


def test_spy_job(client, fake_handlers):
    resp = client.post("/api/spy/analyze", json={"tiktok_url": "https://www.tiktok.com/@x/video/123"})
    assert resp.status_code == 200
    job = _wait_job(client, resp.json()["job_id"])
    assert job["status"] == "completed"
    assert len(job["result"]["scripts"]) == 3
