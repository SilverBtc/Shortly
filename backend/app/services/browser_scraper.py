"""Fallback navigateur headless (Playwright + Chromium) pour les sources TikTok
bloquées en API pure (hashtags : signature X-Bogus/msToken générée côté client).

Utilisé UNIQUEMENT en dernier recours dans scraper_service.scrape_entries :
1. yt-dlp (API) pour profils / URLs directes — par défaut
2. navigateur headless avec cookies de session pour les hashtags — si yt-dlp échoue

Les cookies de session (facultatifs) sont lus depuis backend/data/tiktok_cookies.json
(format d'export navigateur JSON : name/value/domain/path/expirationDate/httpOnly/secure/sameSite).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from app.core.config import get_settings

logger = logging.getLogger(__name__)

DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# Binaires Chromium candidats : binaire par défaut de Playwright, puis chemins connus
CHROME_CANDIDATES: list[Path | None] = [
    None,
    Path.home() / ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
    Path.home() / ".cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    Path("/usr/bin/chromium"),
    Path("/usr/bin/chromium-browser"),
    Path("/usr/bin/google-chrome"),
]

MAX_SCROLLS = 4
SCROLL_STEP = 1200
WAIT_AFTER_SCROLL_MS = 1500


def _cookies_path() -> Path:
    return get_settings().data_dir / "tiktok_cookies.json"


def has_cookies() -> bool:
    return _cookies_path().exists()


def _playwright_cookies() -> list[dict]:
    """Convertit l'export JSON des cookies (extension navigateur) en format Playwright."""
    path = _cookies_path()
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text())
    except (ValueError, OSError) as exc:
        logger.warning("Cookies TikTok illisibles (%s) : %s", path, exc)
        return []

    out: list[dict] = []
    for c in raw:
        if not c.get("name") or not c.get("value"):
            continue
        cookie = {
            "name": c["name"],
            "value": c["value"],
            "domain": c.get("domain", ".tiktok.com"),
            "path": c.get("path", "/"),
        }
        exp = c.get("expirationDate")
        cookie["expires"] = int(exp) if exp else -1
        if c.get("httpOnly"):
            cookie["httpOnly"] = True
        if c.get("secure"):
            cookie["secure"] = True
        same_site = c.get("sameSite")
        if same_site == "no_restriction":
            cookie["sameSite"] = "None"
        elif same_site == "lax":
            cookie["sameSite"] = "Lax"
        elif same_site == "strict":
            cookie["sameSite"] = "Strict"
        out.append(cookie)
    return out


def _launch_chromium():
    """Lance Chromium headless en essayant chaque binaire candidat."""
    from playwright.sync_api import sync_playwright  # import tardif (dépendance lourde)

    playwright = sync_playwright().start()
    last_error: Exception | None = None
    for exe in CHROME_CANDIDATES:
        try:
            kwargs: dict = {
                "headless": True,
                "args": [
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                    "--lang=fr-FR",
                ],
            }
            if exe is not None:
                kwargs["executable_path"] = str(exe)
            browser = playwright.chromium.launch(**kwargs)
            return playwright, browser
        except Exception as exc:  # noqa: BLE001 — on essaie le binaire suivant
            last_error = exc
            logger.debug("Chromium %s indisponible : %s", exe, exc)
    playwright.stop()
    raise RuntimeError(f"Aucun Chromium utilisable : {last_error}")


def scrape_hashtag_urls(hashtag: str, max_items: int = 12) -> list[str]:
    """Ouvre la page tag du hashtag dans un vrai navigateur (avec cookies si présents),
    fait défiler et collecte les URLs des vidéos. Retourne [] si aucun résultat."""
    tag = hashtag.strip().lstrip("#")
    url = f"https://www.tiktok.com/tag/{tag}"
    cookies = _playwright_cookies()
    logger.info("Fallback navigateur : %s (%d cookies)", url, len(cookies))

    playwright, browser = _launch_chromium()
    try:
        ctx = browser.new_context(
            user_agent=DEFAULT_UA,
            locale="fr-FR",
            viewport={"width": 1280, "height": 900},
        )
        if cookies:
            ctx.add_cookies(cookies)
        page = ctx.new_page()
        page.goto(url, timeout=45_000, wait_until="domcontentloaded")
        page.wait_for_timeout(5_000)

        for _ in range(MAX_SCROLLS):
            page.mouse.wheel(0, SCROLL_STEP)
            page.wait_for_timeout(WAIT_AFTER_SCROLL_MS)

        hrefs: list[str] = page.eval_on_selector_all(
            'a[href*="/video/"]', "els => els.map(e => e.href)"
        )
    finally:
        browser.close()
        playwright.stop()

    seen: set[str] = set()
    urls: list[str] = []
    for href in hrefs:
        if href in seen:
            continue
        seen.add(href)
        urls.append(href)
        if len(urls) >= max_items:
            break

    logger.info("Fallback navigateur : %d vidéos trouvées", len(urls))
    return urls
