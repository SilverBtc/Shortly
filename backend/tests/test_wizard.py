"""Tests du module Wizard : validation des routes + bibliothèque musique + flux complet."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.services import qwen_tts_service, tts_service, whisper_service
from app.workers import render_worker


@pytest.fixture()
def mocked_media_services(monkeypatch):
    """Mocke TTS (synthesize) + Whisper (transcribe) + daemon Qwen TTS — Remotion mocké par test."""

    async def fake_synthesize(script, output_path, voice="fr-FR-HenriNeural", rate="+0%", pitch="+0Hz"):
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"ID3-fake-mp3")

    async def fake_transcribe(audio_path, model_size="base", device="cpu", language="fr"):
        words = [
            {"word": "J'étais", "start": 0.0, "end": 0.3},
            {"word": "en", "start": 0.3, "end": 0.5},
            {"word": "croisière", "start": 0.5, "end": 1.0},
            {"word": "moteur", "start": 1.0, "end": 1.5},
        ]
        return words, 1.8

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
    monkeypatch.setattr(qwen_tts_service, "is_available", fake_qwen_available)
    monkeypatch.setattr(qwen_tts_service, "synthesize", fake_qwen_synthesize)
    monkeypatch.setattr("subprocess.run", fake_subprocess_run)


def test_wizard_music_library_empty(client):
    """Bibliothèque musique locale : liste vide si aucun fichier, sans erreur."""
    resp = client.get("/api/wizard/music-library")
    assert resp.status_code == 200
    assert "items" in resp.json()


def test_wizard_fetch_links_validation(client):
    """fetch-links rejette les listes vides (min 1 URL)."""
    resp = client.post("/api/wizard/fetch-links", json={"urls": []})
    assert resp.status_code == 422


def test_wizard_fetch_links_invalid_url(client):
    """fetch-links avec une URL invalide renvoie un item en erreur (jamais de 500)."""
    resp = client.post("/api/wizard/fetch-links", json={"urls": ["https://not-a-real-domain-xyz.invalid/v"]})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["status"].startswith("error")


def test_wizard_script_idea_validation(client):
    """generate-script-from-idea rejette les idées trop courtes."""
    resp = client.post("/api/wizard/generate-script-from-idea", json={"idea": "ab"})
    assert resp.status_code == 422


def test_wizard_optimize_script_accepts_json_body(client, monkeypatch):
    """RÉGRESSION : optimize-script doit lire le JSON body (pas un query param).

    Un body JSON valide doit répondre 200 avec le script optimisé.
    Avant le fix, l'import WizardOptimizeRequest manquant + `from __future__
    import annotations` faisait traiter `body` comme query param -> 422
    `loc: ["query", "body"]` même avec un JSON valide.
    """
    from app.services.llm_service import LLMService

    async def fake_optimize(self, script: str) -> str:
        return f"OPTIMISÉ: {script}"

    monkeypatch.setattr(LLMService, "optimize_script", fake_optimize)

    resp = client.post("/api/wizard/optimize-script", json={"script": "Ceci est un script de test assez long."})
    assert resp.status_code == 200, resp.text
    assert resp.json()["script"] == "OPTIMISÉ: Ceci est un script de test assez long."


def test_wizard_optimize_script_validation(client):
    """optimize-script rejette les scripts trop courts (min 10 chars)."""
    resp = client.post("/api/wizard/optimize-script", json={"script": "court"})
    assert resp.status_code == 422


def test_wizard_render_validation(client):
    """render exige un script non vide (sauf montage seul) et au moins un lien."""
    resp = client.post(
        "/api/wizard/render",
        json={
            "title": "T",
            "script": "",
            "voice_id": "shortly:antoine",
            "links": [{"url": "https://tiktok.com/x"}],
        },
    )
    assert resp.status_code == 422
    resp = client.post(
        "/api/wizard/render",
        json={"title": "T", "script": "Bonjour", "links": []},
    )
    assert resp.status_code == 422


def test_wizard_render_montage_seul_accepte(client, tmp_path):
    """voice_id='none' + script vide = montage seul -> 200 (projet + job créés)."""
    from app.core.config import get_settings

    # Fichier temp factice servable par _copy_to_assets (pas de réseau)
    folder = get_settings().wizard_dir / "test_montage"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "video.mp4").write_bytes(b"fake-mp4")
    video_rel = "temp/test_montage/video.mp4"

    resp = client.post(
        "/api/wizard/render",
        json={
            "title": "Montage seul",
            "script": "",
            "voice_id": "none",
            "links": [{"url": "https://www.tiktok.com/@u/video/1", "video": video_rel}],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "project_id" in body and "job_id" in body


def test_wizard_render_full_pipeline(client, mocked_media_services, monkeypatch):
    """Flux complet wizard : fetch temp -> render -> prepare (TTS/Whisper mockés) -> completed."""
    import time

    from app.core.config import get_settings

    # Fichier temp factice pour _resolve_asset
    folder = get_settings().wizard_dir / "test_pipeline"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "video.mp4").write_bytes(b"fake-mp4")
    video_rel = "temp/test_pipeline/video.mp4"

    # Remotion mocké (comme test_jobs)
    async def fake_run_remotion(project, props):
        out = get_settings().output_dir / f"tiktok_{project.id}_test.mp4"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"\x00" * 512)
        return out

    monkeypatch.setattr(render_worker, "run_remotion_render", fake_run_remotion)

    resp = client.post(
        "/api/wizard/render",
        json={
            "title": "Panne moteur",
            "banner_text": "Panne moteur",
            "script": "J'étais en croisière quand [pause] le moteur s'est tu. [rapide] Silence total dans le cockpit.[/rapide]",
            "voice_id": "shortly:antoine",
            "subtitle_preset": "yellow-white",
            "subtitle_animation": "word",
            "box_enabled": True,
            "mask": {"enabled": True, "x": 5, "y": 70, "width": 90, "height": 18, "blurAmount": 12},
            "music_path": None,
            "links": [{"url": "https://www.tiktok.com/@u/video/42", "video": video_rel, "is_hook": True}],
        },
    )
    assert resp.status_code == 200
    body = resp.json()

    # Poll du job render (séquentiel : prepare puis render, tous deux mockés)
    deadline = time.time() + 12
    while time.time() < deadline:
        job = client.get(f"/api/jobs/{body['job_id']}").json()
        if job["status"] in ("completed", "failed"):
            break
        time.sleep(0.05)
    assert job["status"] == "completed", job.get("error")

    # Le projet est completed avec output_path
    detail = client.get(f"/api/projects/{body['project_id']}").json()
    assert detail["item"]["status"] == "completed"
    assert detail["item"]["output_path"]
    # mask stocké + animation + box
    assert detail["item"]["mask_json"]
    assert detail["item"]["subtitle_animation"] == "word"
    assert detail["item"]["box_enabled"] is True


def test_wizard_voices_empty(client):
    """/voices renvoie une liste (vide par défaut dans l'environnement de test)."""
    resp = client.get("/api/wizard/voices")
    assert resp.status_code == 200
    assert "items" in resp.json()


def test_wizard_music_audio_accepte_nom_sans_extension(client, tmp_path):
    """La pré-écoute accepte le nom sans extension (comme renvoyé par music-library)."""
    from app.core.config import get_settings

    (get_settings().music_dir / "test-piste.mp3").write_bytes(b"ID3fake")
    ok = client.get("/api/wizard/music/audio/test-piste")
    assert ok.status_code == 200
    assert ok.headers["content-type"].startswith("audio")
    with_ext = client.get("/api/wizard/music/audio/test-piste.mp3")
    assert with_ext.status_code == 200
    missing = client.get("/api/wizard/music/audio/introuvable")
    assert missing.status_code == 404
    (get_settings().music_dir / "test-piste.mp3").unlink()


def test_wizard_tts_preview_validation(client):
    """tts-preview rejette un texte vide."""
    resp = client.post("/api/wizard/tts-preview", json={"text": "", "voice": "shortly:antoine"})
    assert resp.status_code == 422
