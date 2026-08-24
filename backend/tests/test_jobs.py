"""Tests des pipelines prepare/render avec services externes mockés (TTS, Whisper, Remotion)."""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.services import qwen_tts_service, tts_service, whisper_service
from app.workers import render_worker, task_queue


def _wait_job(client, job_id: str, timeout: float = 8.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = client.get(f"/api/jobs/{job_id}")
        assert resp.status_code == 200, resp.text
        job = resp.json()
        if job["status"] in ("completed", "failed"):
            return job
        time.sleep(0.05)
    raise AssertionError(f"Job {job_id} pas terminé après {timeout}s")


@pytest.fixture()
def mocked_media_services(client, monkeypatch):
    """Mocke TTS (synthesize) + Whisper (transcribe) + Remotion (subprocess)."""

    async def fake_synthesize(script, output_path, voice="fr-FR-HenriNeural", rate="+0%", pitch="+0Hz"):
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"ID3-fake-mp3")

    async def fake_transcribe(audio_path, model_size="base", device="cpu", language="fr"):
        words = [
            {"word": "J'ai", "start": 0.0, "end": 0.3},
            {"word": "nettoyé", "start": 0.3, "end": 0.7},
            {"word": "l'appartement", "start": 0.7, "end": 1.4},
            {"word": "horreur", "start": 1.4, "end": 1.9},
        ]
        return words, 2.4

    async def fake_run_remotion(project, props):
        settings = get_settings()
        out = settings.output_dir / f"tiktok_{project.id}_test.mp4"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"\x00" * 512)
        return out

    def fake_qwen_available():
        return True

    def fake_qwen_synthesize(text, voice_name, output_dir):
        wav = output_dir / f"qwen_{voice_name}.wav"
        output_dir.mkdir(parents=True, exist_ok=True)
        wav.write_bytes(b"FAKE-WAV")
        return wav, 2.4

    class _FakeCompletedProcess:
        def __init__(self, returncode: int = 0, stdout: str = ""):
            self.returncode = returncode
            self.stdout = stdout

    def fake_subprocess_run(args, **kwargs):
        # ffprobe → durée factice ; ffmpeg → dernier arg = fichier de sortie
        if args and args[0] == "ffprobe":
            return _FakeCompletedProcess(0, "2.4")
        out = Path(args[-1])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"fake-mp3")
        return _FakeCompletedProcess()

    monkeypatch.setattr(tts_service, "synthesize", fake_synthesize)
    monkeypatch.setattr(whisper_service.whisper_service, "transcribe", fake_transcribe)
    monkeypatch.setattr(render_worker, "run_remotion_render", fake_run_remotion)
    monkeypatch.setattr(qwen_tts_service, "is_available", fake_qwen_available)
    monkeypatch.setattr(qwen_tts_service, "synthesize", fake_qwen_synthesize)
    monkeypatch.setattr("subprocess.run", fake_subprocess_run)


def _create_approved_asset(client, monkeypatch, asset_path: Path) -> int:
    """Crée un asset approuvé via un job scrape fake."""

    async def fake_scrape(payload, job_id):
        from app.core.database import SessionLocal
        from app.models.sql_models import MediaAsset

        async with SessionLocal() as db:
            asset = MediaAsset(
                source_url="https://www.tiktok.com/@x/video/99",
                file_path=str(asset_path),
                thumbnail_path=None,
                title="Clip test",
                niche="Barber",
                status="pending",
                duration=5.0,
            )
            db.add(asset)
            await db.commit()
            await db.refresh(asset)
            return {"items": [asset.to_dict()]}

    monkeypatch.setitem(task_queue.HANDLERS, "scrape", fake_scrape)
    resp = client.post(
        "/api/curation/scrape",
        json={"source_type": "url", "query": "https://example.com/v", "limit": 1, "niche": "Barber"},
    )
    job = _wait_job(client, resp.json()["job_id"])
    asset_id = job["result"]["items"][0]["id"]
    client.post(f"/api/curation/assets/{asset_id}/approve")
    return asset_id


def test_prepare_pipeline(client, mocked_media_services):
    """POST /prepare -> TTS (mock) -> Whisper (mock) -> audio + timestamps en base."""
    resp = client.post(
        "/api/projects",
        json={
            "title": "Projet prepare",
            "script_raw": "J'ai [pause] nettoyé [insistance]l'appartement[/insistance]",
        },
    )
    pid = resp.json()["item"]["id"]

    resp = client.post(f"/api/projects/{pid}/prepare")
    assert resp.status_code == 200
    job = _wait_job(client, resp.json()["job_id"])
    assert job["status"] == "completed", job

    result = job["result"]
    assert result["duration_seconds"] == 2.4
    assert len(result["timestamps"]) == 4
    assert result["audio_path"].endswith(".mp3")
    assert "<speak" in result["script_ssml"]
    assert '<break time="350ms"/>' in result["script_ssml"]
    assert '<prosody pitch="+5Hz" rate="-5%">l\'appartement</prosody>' in result["script_ssml"]

    # le projet a été mis à jour en base
    resp = client.get(f"/api/projects/{pid}")
    item = resp.json()["item"]
    assert item["audio_path"] is not None
    assert item["timestamps_json"] is not None
    timestamps = json.loads(item["timestamps_json"])
    assert timestamps[0]["word"] == "J'ai"


def test_render_pipeline(client, mocked_media_services, monkeypatch, tmp_path):
    """POST /render -> pipeline complet (mock) -> statut completed + output_path."""
    # Asset vidéo factice existant
    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"fake-video")

    asset_id = _create_approved_asset(client, monkeypatch, clip)

    resp = client.post(
        "/api/projects",
        json={
            "title": "Projet render",
            "niche": "Barber",
            "script_raw": "C'est la dernière fois [pause] que j'accepte de couper les cheveux.",
        },
    )
    pid = resp.json()["item"]["id"]

    resp = client.post(f"/api/projects/{pid}/assets", json={"asset_id": asset_id, "is_hook": True})
    assert resp.status_code == 200

    resp = client.post(f"/api/projects/{pid}/render")
    assert resp.status_code == 200
    job = _wait_job(client, resp.json()["job_id"], timeout=12.0)
    assert job["status"] == "completed", job

    result = job["result"]
    assert result["output_path"].endswith(".mp4")
    assert "/media/output/" in result["output_url"]

    resp = client.get(f"/api/projects/{pid}")
    assert resp.json()["item"]["status"] == "completed"
    assert resp.json()["item"]["output_path"] is not None


def test_render_failure_sets_failed(client, mocked_media_services, monkeypatch):
    """Un échec Remotion doit passer le projet en status=failed."""
    async def boom(project, props):
        raise RuntimeError("Remotion a explosé")

    monkeypatch.setattr(render_worker, "run_remotion_render", boom)

    resp = client.post(
        "/api/projects",
        json={"title": "Projet échec", "script_raw": "Un script [pause] qui échoue"},
    )
    pid = resp.json()["item"]["id"]

    resp = client.post(f"/api/projects/{pid}/render")
    job = _wait_job(client, resp.json()["job_id"], timeout=12.0)
    assert job["status"] == "failed"
    assert "explosé" in job["error"]

    resp = client.get(f"/api/projects/{pid}")
    assert resp.json()["item"]["status"] == "failed"


def test_render_requires_script(client, mocked_media_services):
    resp = client.post("/api/projects", json={"title": "Sans script"})
    pid = resp.json()["item"]["id"]
    resp = client.post(f"/api/projects/{pid}/render")
    job = _wait_job(client, resp.json()["job_id"])
    assert job["status"] == "failed"
