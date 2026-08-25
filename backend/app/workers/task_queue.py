"""File de tâches asynchrone (asyncio.Queue) + registre de jobs.

Alternative légère à Redis+ARQ : suffisant en mono-processus uvicorn.
Pour passer à Redis/ARQ, remplacer JobStore par une table Redis et
_worker_loop par l'exécuteur ARQ — le contrat de enqueue() reste identique.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobStore:
    """Registre des jobs persisté sur disque (backend/data/jobs.json).

    Les jobs survivent aux redémarrages du backend — le polling du frontend
    ne tombe plus sur un 404 après un restart.
    """

    MAX_AGE_S = 24 * 3600

    def __init__(self, path: str | Path | None = None) -> None:
        from app.core.config import get_settings

        settings = get_settings()
        self._path = Path(path or (settings.data_dir / "jobs.json"))
        self._jobs: dict[str, dict] = self._load()

    def _load(self) -> dict[str, dict]:
        if not self._path.exists():
            return {}
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            now = time.time()
            return {
                k: v
                for k, v in data.items()
                if now - _job_ts(v) < self.MAX_AGE_S
            }
        except Exception:
            logger.warning("jobs.json illisible — registre vide", exc_info=True)
            return {}

    def _persist(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(self._jobs, ensure_ascii=False), encoding="utf-8")
            tmp.replace(self._path)
        except Exception:
            logger.warning("Échec persistance jobs", exc_info=True)

    def create(self, kind: str) -> str:
        job_id = uuid.uuid4().hex[:12]
        self._jobs[job_id] = {
            "job_id": job_id,
            "kind": kind,
            "status": "queued",
            "result": None,
            "error": None,
            "created_at": _now(),
            "updated_at": _now(),
        }
        self._persist()
        return job_id

    def set_status(self, job_id: str, status: str, **extra) -> None:
        job = self._jobs.get(job_id)
        if job is None:
            return
        job.update({"status": status, "updated_at": _now()})
        job.update(extra)
        self._persist()

    def get(self, job_id: str) -> dict | None:
        job = self._jobs.get(job_id)
        return dict(job) if job else None

    def list(self) -> list[dict]:
        return [dict(j) for j in self._jobs.values()]


def _job_ts(job: dict) -> float:
    """Timestamp (epoch) du job pour la purge."""
    raw = job.get("updated_at") or job.get("created_at") or ""
    try:
        return datetime.fromisoformat(raw).timestamp()
    except Exception:
        return 0.0


_store = JobStore()
_queue: asyncio.Queue | None = None
_queue_owner: object = None
_worker_task: asyncio.Task | None = None

# Registry rempli par workers/handlers.py (évite les imports circulaires)
HANDLERS: dict[str, callable] = {}


def register_handler(kind: str, handler: callable) -> None:
    HANDLERS[kind] = handler


def _get_queue() -> asyncio.Queue:
    """Queue liée au event loop courant (chaque loop reçoit sa propre instance).

    Les TestClient pytest créent un event loop par test : une queue globale
    unique resterait liée au premier loop fermé -> RuntimeError.
    """
    global _queue, _queue_owner
    running = asyncio.get_running_loop()
    if _queue is None or _queue_owner is not running:
        _queue = asyncio.Queue()
        _queue_owner = running
    return _queue


def enqueue(kind: str, payload: dict) -> str:
    """Ajoute une tâche à la file et renvoie son job_id (polling via /api/jobs/{id})."""
    if kind not in HANDLERS:
        raise ValueError(f"Aucun handler pour le type de job : {kind}")
    job_id = _store.create(kind)
    _get_queue().put_nowait({"job_id": job_id, "kind": kind, "payload": payload})
    logger.info("Job %s (%s) mis en file", job_id, kind)
    return job_id


def get_job(job_id: str) -> dict | None:
    return _store.get(job_id)


def list_jobs() -> list[dict]:
    return _store.list()


async def worker_loop() -> None:
    """Consommateur unique de la file : exécute chaque job séquentiellement."""
    logger.info("Worker asynchrone démarré")
    queue = _get_queue()
    while True:
        task = await queue.get()
        job_id = task["job_id"]
        kind = task["kind"]
        _store.set_status(job_id, "running")
        try:
            handler = HANDLERS.get(kind)
            if handler is None:
                raise RuntimeError(f"Handler introuvable : {kind}")
            result = await handler(task["payload"], job_id)
            _store.set_status(job_id, "completed", result=result)
            logger.info("Job %s (%s) terminé", job_id, kind)
        except Exception as exc:  # noqa: BLE001 — le worker ne doit jamais mourir
            logger.exception("Job %s (%s) en échec", job_id, kind)
            _store.set_status(job_id, "failed", error=str(exc))
        finally:
            queue.task_done()


def start_worker() -> None:
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(worker_loop())


async def stop_worker() -> None:
    global _worker_task
    if _worker_task is not None:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
        _worker_task = None
