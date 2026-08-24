"""Tests du parseur SSML — le cœur du service TTS (exigences exactes du spec)."""
from __future__ import annotations

import pytest

from app.services.tts_service import clean_script, script_to_ssml


def test_pause_courte_avant_pause():
    """L'ordre de remplacement doit traiter [pause courte] AVANT [pause]."""
    ssml = script_to_ssml("[pause courte] là [pause] maintenant", voice="fr-FR-HenriNeural")
    assert '<break time="180ms"/>' in ssml
    assert '<break time="350ms"/>' in ssml
    # l'ordre dans le texte doit être conservé
    assert ssml.index('180ms') < ssml.index('350ms')


def test_pause_simple():
    ssml = script_to_ssml("Et là [pause] je découvre.", voice="fr-FR-HenriNeural")
    assert '<break time="350ms"/>' in ssml
    assert "[pause]" not in ssml


def test_rapide_paired():
    ssml = script_to_ssml("[rapide]je cours vite[/rapide]", voice="fr-FR-DeniseNeural")
    assert '<prosody rate="+15%">je cours vite</prosody>' in ssml


def test_insistance_paired():
    ssml = script_to_ssml("[insistance]jamais[/insistance] vu ça", voice="fr-FR-HenriNeural")
    assert '<prosody pitch="+5Hz" rate="-5%">jamais</prosody>' in ssml


def test_grave_paired():
    ssml = script_to_ssml("[grave]c'est un secret[/grave]", voice="fr-FR-HenriNeural")
    assert '<prosody pitch="-10Hz">c\'est un secret</prosody>' in ssml


def test_chuchotement_paired():
    ssml = script_to_ssml("[chuchotement]chut[/chuchotement]", voice="fr-FR-HenriNeural")
    assert '<prosody volume="soft" rate="-10%">chut</prosody>' in ssml


def test_full_ssml_wrapper():
    ssml = script_to_ssml("Bonjour [pause] tout le monde", voice="fr-FR-EloiseNeural")
    assert ssml.startswith('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR">')
    assert '<voice name="fr-FR-EloiseNeural">' in ssml
    assert ssml.endswith("</voice></speak>")


def test_clean_script_strips_all_tags():
    raw = "Bonjour [pause] [rapide]vite vite[/rapide] [insistance]stop[/insistance] fin"
    cleaned = clean_script(raw)
    assert "[pause]" not in cleaned
    assert "[rapide]" not in cleaned
    assert "[/rapide]" not in cleaned
    assert "[insistance]" not in cleaned
    assert "vite vite" in cleaned
    assert "Bonjour" in cleaned and "fin" in cleaned


def test_clean_script_unclosed_tag():
    cleaned = clean_script("texte [rapide] sans fermeture")
    assert "[rapide]" not in cleaned
    assert "texte" in cleaned


def test_empty_script_raises():
    with pytest.raises(ValueError):
        script_to_ssml("   ", voice="fr-FR-HenriNeural")


def test_xml_escaping():
    ssml = script_to_ssml("Je dis « 100% & plus » <ok>", voice="fr-FR-HenriNeural")
    assert "&amp;" in ssml
    assert "&lt;ok&gt;" in ssml
    # les balises SSML générées restent intactes
    assert '<break time="350ms"/>' not in " ".join(ssml.split())  # aucune balise ajoutée ici


def test_nested_pause_inside_prosody():
    ssml = script_to_ssml("[grave]un secret [pause] énorme[/grave]", voice="fr-FR-HenriNeural")
    assert '<prosody pitch="-10Hz">un secret <break time="350ms"/> énorme</prosody>' in ssml
