"""Service de notification Discord (webhook, embed riche)."""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

STATUS_COLORS = {
    "completed": 0x22C55E,  # vert
    "failed": 0xEF4444,  # rouge
    "rendering": 0xF59E0B,  # orange
    "queued": 0x3B82F6,  # bleu
    "running": 0x3B82F6,
}

STATUS_LABELS = {
    "completed": "✅ Prêt",
    "failed": "❌ Échec",
    "rendering": "🎬 Rendu en cours",
    "queued": "⏳ En file",
    "running": "⚙️ Traitement",
}


async def notify_render(
    webhook_url: str,
    *,
    project_title: str,
    niche: str | None,
    duration_seconds: float | None,
    status: str,
    mp4_url: str | None = None,
    error: str | None = None,
) -> bool:
    """Envoie un embed Discord de notification de rendu."""
    if not webhook_url:
        logger.info("Pas de webhook Discord configuré — notification ignorée.")
        return False

    description = f"**{project_title}**"
    if niche:
        description += f"\nNiche : {niche}"
    if duration_seconds:
        description += f"\nDurée : {duration_seconds:.1f}s"
    if error:
        description += f"\nErreur : `{error[:300]}`"

    embed = {
        "title": f"TikTok Studio — {STATUS_LABELS.get(status, status)}",
        "description": description,
        "color": STATUS_COLORS.get(status, 0x3B82F6),
        "footer": {"text": "TikTok Studio · rendu automatique"},
    }
    if mp4_url:
        embed["url"] = mp4_url

    payload = {"content": None, "embeds": [embed]}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
        logger.info("Notification Discord envoyée (status=%s)", status)
        return True
    except Exception as exc:
        logger.warning("Échec notification Discord : %s", exc)
        return False
