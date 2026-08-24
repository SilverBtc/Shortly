"""Tests du fallback navigateur — conversion cookies (sans navigateur réel)."""
from __future__ import annotations

import json

from app.core.config import get_settings
from app.services import browser_scraper


def test_playwright_cookies_conversion():
    """Un export JSON navigateur (extension cookies) est converti au format Playwright."""
    data_dir = get_settings().data_dir
    (data_dir / "tiktok_cookies.json").write_text(
        json.dumps(
            [
                {
                    "name": "sessionid",
                    "value": "abc",
                    "domain": ".tiktok.com",
                    "path": "/",
                    "expirationDate": 1800000000,
                    "httpOnly": True,
                    "secure": True,
                    "sameSite": "no_restriction",
                },
                {
                    "name": "msToken",
                    "value": "tok",
                    "domain": ".www.tiktok.com",
                    "path": "/",
                    "session": True,
                    "httpOnly": False,
                    "secure": False,
                    "sameSite": "unspecified",
                },
            ]
        )
    )
    try:
        converted = browser_scraper._playwright_cookies()
        assert len(converted) == 2

        c0 = converted[0]
        assert c0["name"] == "sessionid"
        assert c0["domain"] == ".tiktok.com"
        assert c0["expires"] == 1800000000
        assert c0["httpOnly"] is True
        assert c0["secure"] is True
        assert c0["sameSite"] == "None"

        c1 = converted[1]
        assert c1["expires"] == -1  # cookie de session -> -1 pour Playwright
        assert "sameSite" not in c1  # unspecified -> non défini
    finally:
        (data_dir / "tiktok_cookies.json").unlink(missing_ok=True)


def test_playwright_cookies_absent():
    """Sans fichier cookies, la conversion renvoie une liste vide (aucune levée)."""
    data_dir = get_settings().data_dir
    path = data_dir / "tiktok_cookies.json"
    existed = path.exists()
    if existed:
        path.unlink()
    try:
        assert browser_scraper._playwright_cookies() == []
        assert browser_scraper.has_cookies() is False
    finally:
        if existed:
            path.write_text(json.dumps([]))  # restaure l'état d'origine (vide)
