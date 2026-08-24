"""Service TTS Edge-TTS avec parseur SSML / balises d'émotion.

Convertit les balises d'intonation du script en balises SSML natives :
    [pause]        -> <break time="350ms"/>
    [pause courte] -> <break time="180ms"/>
    [rapide]...[/rapide]              -> <prosody rate="+15%">...</prosody>
    [insistance]...[/insistance]      -> <prosody pitch="+5Hz" rate="-5%">...</prosody>
    [grave]...[/grave]                -> <prosody pitch="-10Hz">...</prosody>
    [chuchotement]...[/chuchotement]  -> <prosody volume="soft" rate="-10%">...</prosody>
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

import edge_tts

logger = logging.getLogger(__name__)

# Balises paires (ouvrantes/fermantes) -> balise SSML ouvrante
PAIRED_TAGS: list[tuple[str, str, str]] = [
    ("rapide", '<prosody rate="+15%">', "</prosody>"),
    ("insistance", '<prosody pitch="+5Hz" rate="-5%">', "</prosody>"),
    ("grave", '<prosody pitch="-10Hz">', "</prosody>"),
    ("chuchotement", '<prosody volume="soft" rate="-10%">', "</prosody>"),
]

# Balises autonomes (ordre important : [pause courte] AVANT [pause])
STANDALONE_TAGS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\[pause courte\]", re.IGNORECASE), '<break time="180ms"/>'),
    (re.compile(r"\[pause\]", re.IGNORECASE), '<break time="350ms"/>'),
]

TAG_NAMES = ("pause courte", "pause", "rapide", "insistance", "grave", "chuchotement")
_CLEAN_RE = re.compile(r"\[/?(?:" + "|".join(re.escape(t) for t in TAG_NAMES) + r")\]", re.IGNORECASE)
_SSML_ESCAPE_RE = re.compile(r"[&<>\"']")


def _escape_ssml(text: str) -> str:
    """Échappe les caractères réservés XML (texte de contenu : & < > suffisent)."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def clean_script(text: str) -> str:
    """Retire toutes les balises de rythme brutes -> texte parlé propre."""
    cleaned = _CLEAN_RE.sub("", text)
    # Nettoie aussi les espaces multiples créés par les suppressions
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def script_to_ssml(text: str, voice: str = "fr-FR-HenriNeural") -> str:
    """Transforme un script balisé en payload SSML complet pour edge-tts."""
    if not text or not text.strip():
        raise ValueError("Le script est vide.")

    ssml_body = text

    # 1) Balises paires -> prosody (regex non-greedy, ordre défini)
    for tag, open_tag, close_tag in PAIRED_TAGS:
        pattern = re.compile(rf"\[{re.escape(tag)}\](.*?)\[/{re.escape(tag)}\]", re.IGNORECASE | re.DOTALL)

        def _replace(match: re.Match[str], _open: str = open_tag, _close: str = close_tag) -> str:
            return f"{_open}{match.group(1).strip()}{_close}"

        ssml_body = pattern.sub(_replace, ssml_body)

    # 2) Balises autonomes -> break (ordre : courte d'abord)
    for pattern, replacement in STANDALONE_TAGS:
        ssml_body = pattern.sub(replacement, ssml_body)

    # 3) Nettoie les éventuelles balises non appariées restantes
    ssml_body = _CLEAN_RE.sub("", ssml_body)

    # 4) Échappement XML sûr (uniquement ce qui n'est pas déjà une balise SSML)
    ssml_body = re.sub(
        r"(<prosody[^>]*>|</prosody>|<break[^>]*/>)",
        lambda m: "\x00" + m.group(0) + "\x00",
        ssml_body,
    )
    parts = ssml_body.split("\x00")
    for i in range(0, len(parts), 2):
        parts[i] = _escape_ssml(parts[i])
    ssml_body = "".join(parts)

    return (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR">'
        f'<voice name="{voice}">{ssml_body}</voice>'
        f"</speak>"
    )


async def synthesize(
    script: str,
    output_path: Path,
    voice: str = "fr-FR-HenriNeural",
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> Path:
    """Génère le voiceover.mp3 à partir du script balisé (payload SSML)."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    ssml = script_to_ssml(script, voice=voice)
    logger.info("Synthèse TTS : voice=%s rate=%s pitch=%s -> %s", voice, rate, pitch, output_path)

    communicate = edge_tts.Communicate(ssml, voice=voice, rate=rate, pitch=pitch)
    await communicate.save(str(output_path))

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError(f"La synthèse TTS n'a produit aucun fichier : {output_path}")

    logger.info("Voiceover généré : %s (%d octets)", output_path, output_path.stat().st_size)
    return output_path
