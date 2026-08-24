"""Service LLM : client OpenAI-compatible (OpenAI, OpenRouter, Groq, Ollama, vLLM)."""
from __future__ import annotations

import logging
from typing import Any

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# Prompt système du Wizard Étape 4 (mission « Refonte du workflow » — texte exact)
WIZARD_SCRIPT_PROMPT = """Tu es le meilleur scénariste de vidéos courtes virales TikTok (format storytelling immersif POV métier / narration vécue à la 1ère personne).

MISSION :
L'utilisateur te fournit des notes brutes, des idées ou un résumé d'une situation. Tu dois transformer cela en un script TikTok captivant, ultra-rythmé et conversationnel.

CONTRAINTES DE DURÉE STRICTES :
- Le script doit faire STRICTEMENT entre 135 et 155 mots français pour durer entre 61 et 66 secondes à l'oral.
- Rédige TOUJOURS à la première personne du singulier (« je »).

STRUCTURE VIRALE OBLIGATOIRE :
1. Hook (0-3s) : Une phrase choc qui accroche immédiatement la curiosité ou pose un dilemme anormal.
2. Corps du récit (3-50s) : Actions concrètes, détails sensoriels, vocabulaire immersif et punchy. Pas de phrases complexes, fais des phrases courtes.
3. Cliffhanger / Loop (50-62s) : Fin abrupte sur une révélation ou une ouverture intrigante qui incite à commenter.

BALISES SSML À INTÉGRER DANS LE TEXTE :
Utilise judicieusement ces balises pour donner de la vie à la synthèse vocale :
- [pause] : silence de respiration ou de tension (ex: « Et là... [pause] l'alarme retentit. »).
- [rapide]...[/rapide] : accélération pour marquer le stress ou l'action.
- [insistance]...[/insistance] : accentue les mots clés.
- [grave]...[/grave] : baisse de ton pour les confidences.

Sortie : Renvoie UNIQUEMENT le texte final du script à lire à voix haute avec ses balises. Aucun mot d'introduction ni de conclusion."""

VIRAL_SCRIPT_PROMPT = """Tu es le meilleur scénariste de vidéos courtes virales sur TikTok (format storytelling immersif / POV métier à la 1ère personne).

OBJECTIF :
Rédiger un récit captivant à la première personne (« je »), rythmé, immersif et conversationnel, calibré STRICTEMENT pour durer entre 61 et 66 secondes à l'oral (entre 135 et 155 mots en français parlé).

RÈGLES DE RÉTENTION & STRUCTURE :
1. HOOK (0-3s) : Une phrase choc qui pose une situation anormale, un conflit ou une intrigue directe (ex: « J'ai nettoyé l'appartement d'un mec qui... » ou « C'est la dernière fois que j'accepte de couper les cheveux d'un... »).
2. DÉVELOPPEMENT (3-50s) : Raconte l'histoire avec des détails sensoriels et visuels qui collent au métier. Phrases courtes, punchy, langage parlé naturel (pas de style littéraire ou académique).
3. CLIFFHANGER / LOOP (50-62s) : L'histoire doit monter en tension et se terminer sur une coupure nette ou une réflexion intrigante qui donne envie de commenter ou de revoir la vidéo.

BALISES DE RYTHME ET D'EXPRESSIVITÉ :
Tu PEUX et DOIS insérer les balises suivantes dans le texte pour guider le moteur vocal :
- [pause] : Insère un silence de respiration ou de suspense (ex: « Et là... [pause] je découvre l'horreur. »)
- [insistance] : Accentue le mot ou la phrase suivante.
- [rapide] : Accélère légèrement le débit pour marquer l'urgence.
- [grave] : Baisse la tonalité pour confier un secret ou une tension.
- [chuchotement] : Baisse le volume et adoucit la voix.

CONTRAINTES STRICTES :
- Ne jamais mettre de texte de présentation, d'explication ou de salutation.
- Renvoyer UNIQUEMENT le texte du script à lire à voix haute avec ses balises.
- Longueur totale : entre 135 et 155 mots."""

VOICE_DESIGN_PROMPT = """Tu es le meilleur directeur artistique vocal pour TikTok. Tu maîtrises parfaitement le modèle Qwen3-TTS-12Hz-1.7B-VoiceDesign qui génère une voix à partir d'une description en langage naturel (instruct).

MISSION :
À partir d'une description de situation vidéo fournie par l'utilisateur ET d'une durée cible en secondes, tu produis :
1. Le script complet à faire dire par la voix (en français, calibré pour la durée).
2. L'instruct de design vocal : une description riche et précise de la voix idéale pour ce contexte.
3. Les paramètres d'échantillonnage optimaux.

RÈGLES DU SCRIPT :
- Calibrage durée : ~2,3 mots/seconde à l'oral en français parlé. Pour une durée D secondes, vise D×2,3 mots (±10%).
- Écrit à la première personne (« je »), style TikTok conversationnel, phrases courtes et punchy.
- Structure : HOOK choc dans les 3 premières secondes → développement immersif → fin qui donne envie de commenter.
- AUCUNE balise SSML ([pause], [rapide]...) : le modèle VoiceDesign gère la prosodie via l'instruct.
- Pas de guillemets ni de caractères spéciaux exotiques.

RÈGLES DE L'INSTRUCT VOIX (le plus important) :
- Décris la voix comme un casting : genre, âge approximatif, timbre (grave/aigu/rauque/doux), débit, énergie, émotion dominante, intention (confession, urgence, mystère...), respiration, micro-détails vocaux (légèrement enrouée, sourire audible...).
- Longueur : 2 à 4 phrases riches. Peut être en français ou en anglais (l'anglais fonctionne très bien).
- Cohérente avec la situation : une confession intime ≠ un tutoriel énergique.

RÈGLES DES PARAMÈTRES (plages autorisées) :
- temperature: 0.7-1.2 (0.8 = posé/naturel, 1.0-1.15 = expressif/énergique)
- top_p: 0.85-0.98
- top_k: 20-100
- repetition_penalty: 1.0-1.15
- subtalker_temperature: 0.7-1.2 (prosodie/rythme)
- subtalker_top_p: 0.85-0.98
- subtalker_top_k: 20-100
Choisis des valeurs adaptées au ton : narration calme → bas ; storytelling viral énergique → haut.

FORMAT DE SORTIE — renvoie UNIQUEMENT ce JSON valide, sans markdown ni commentaire :
{
  "script": "...",
  "instruct": "...",
  "params": {
    "temperature": 1.0,
    "top_p": 0.95,
    "top_k": 50,
    "repetition_penalty": 1.05,
    "subtalker_temperature": 1.0,
    "subtalker_top_p": 0.95,
    "subtalker_top_k": 50
  }
}"""


class LLMService:
    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self.base_url = base_url
        self.api_key = api_key or "sk-none"
        self.model = model or "gpt-4o-mini"
        self.client = AsyncOpenAI(base_url=base_url, api_key=self.api_key, timeout=120.0)

    async def _chat(self, messages: list[dict[str, Any]], temperature: float = 0.9) -> str:
        extra = {"enable_thinking": False, "thinking": {"type": "disabled"}} if "deepseek" in self.model.lower() else None
        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=700,
            extra_body=extra,
        )
        msg = resp.choices[0].message
        content = (msg.content or "").strip()
        if not content:
            rc = getattr(msg, "reasoning_content", None) or getattr(msg, "reasoning", None)
            if rc:
                content = str(rc).strip()
        if not content:
            try:
                raw_extra = getattr(msg, "model_extra", None) or {}
                for k in ("reasoning_content", "reasoning", "thinking"):
                    if raw_extra.get(k):
                        content = str(raw_extra[k]).strip()
                        break
            except Exception:
                pass
        if not content:
            logger.error("LLM vide — msg=%s", msg)
            raise RuntimeError("Le LLM a renvoyé une réponse vide (vérifiez provider/model).")
        # DeepSeek thinking a fuité dans le contenu : on le détecte et on retry une fois
        is_thinking = content.lower().startswith("nous devons") or "structure : hook" in content.lower()[:600]
        if is_thinking:
            logger.warning("LLM thinking détecté (%d mots) — retry", len(content.split()))
            retry_messages = messages + [{"role": "user", "content": "IMPORTANT: Renvoie UNIQUEMENT le script final (135-155 mots) avec ses balises. Pas de réflexion."}]
            resp2 = await self.client.chat.completions.create(
                model=self.model, messages=retry_messages, temperature=temperature, max_tokens=700, extra_body=extra,
            )
            msg2 = resp2.choices[0].message
            c2 = (msg2.content or "").strip() or str(getattr(msg2, "reasoning_content", "") or "").strip()
            if c2 and not c2.lower().startswith("nous devons"):
                content = c2
        return content

    async def generate_script(self, niche: str, subject: str | None = None) -> str:
        """Génère un script viral pour une niche (Prompt Système du spec)."""
        user = f"Écris un script TikTok pour la niche « {niche} »."
        if subject:
            user += f"\nSujet imposé : {subject}."
        user += (
            "\nRespecte strictement la structure HOOK / DÉVELOPPEMENT / CLIFFHANGER, "
            "les balises de rythme et la longueur 135-155 mots."
        )
        logger.info("Génération de script LLM (niche=%s, modèle=%s)", niche, self.model)
        return await self._chat(
            [{"role": "system", "content": VIRAL_SCRIPT_PROMPT}, {"role": "user", "content": user}],
            temperature=0.95,
        )

    async def rewrite_scripts(self, transcript: str, count: int = 3) -> list[str]:
        """Réécrit une transcription en `count` variations plus accrocheuses (1ère personne)."""
        scripts: list[str] = []
        for i in range(1, count + 1):
            user = (
                f"Voici la transcription mot-à-mot d'une vidéo TikTok virale :\n\n{transcript}\n\n"
                f"Réécris cette histoire en VARIATION {i} : à la première personne, avec une accroche "
                "plus puissante dans les 3 premières secondes, un développement rythmé et un cliffhanger "
                "final. Utilise les balises [pause], [insistance], [rapide], [grave], [chuchotement]. "
                "135-155 mots. Renvoie UNIQUEMENT le script."
            )
            logger.info("Réécriture LLM variation %d/%d", i, count)
            scripts.append(await self._chat(
                [{"role": "system", "content": VIRAL_SCRIPT_PROMPT}, {"role": "user", "content": user}],
                temperature=0.9,
            ))
        return scripts

    async def generate_script_from_idea(self, idea: str, niche: str | None = None) -> str:
        """Wizard Étape 4 — Option A : transforme des idées brutes en script viral balisé.

        Utilise le prompt système exact spécifié dans la mission
        « Refonte du workflow en wizard 5 étapes ».
        """
        user = f"Voici mes idées brutes à transformer en script :\n\n{idea}"
        if niche:
            user += f"\n\nMétier / niche du récit : {niche}."
        logger.info("Génération script depuis idée (niche=%s, modèle=%s)", niche, self.model)
        return await self._chat(
            [{"role": "system", "content": WIZARD_SCRIPT_PROMPT}, {"role": "user", "content": user}],
            temperature=0.95,
        )

    async def optimize_script(self, script: str) -> str:
        """Wizard Étape 4 — ⚡ Optimise : raccourcit/allonge le script pour
        tomber strictement entre 61 et 65 secondes d'élocution (135-155 mots)."""
        user = (
            f"Voici un script TikTok à optimiser :\n\n{script}\n\n"
            "Raccourcis ou allonge ce script pour qu'il dure STRICTEMENT entre 61 et 65 secondes "
            "à l'oral (135 à 155 mots français). Garde le hook percutant, la 1ère personne, "
            "les balises [pause], [rapide]...[/rapide], [insistance]...[/insistance], [grave]...[/grave]. "
            "Renvoie UNIQUEMENT le script final optimisé, sans commentaire."
        )
        logger.info("Optimisation LLM du script (modèle=%s)", self.model)
        return await self._chat(
            [{"role": "system", "content": WIZARD_SCRIPT_PROMPT}, {"role": "user", "content": user}],
            temperature=0.7,
        )

    async def design_voice(self, situation: str, duration_s: float, language: str = "Français") -> dict:
        """Voice Design : situation + durée -> {script, instruct, params}.

        Utilisé par l'onglet /voice-design : l'utilisateur décrit juste la
        situation voulue et la durée, le LLM produit tout le reste.
        """
        user = (
            f"Situation / contexte de la vidéo :\n{situation}\n\n"
            f"Durée audio cible : {duration_s:.0f} secondes.\n"
            f"Langue du script : {language}.\n\n"
            "Produis le JSON complet (script calibré sur la durée, instruct de voix "
            "adapté au contexte, params optimaux dans les plages autorisées)."
        )
        logger.info("Voice Design LLM (durée=%.0fs, modèle=%s)", duration_s, self.model)
        raw = await self._chat(
            [{"role": "system", "content": VOICE_DESIGN_PROMPT}, {"role": "user", "content": user}],
            temperature=0.9,
        )
        return _parse_voice_design_json(raw)


def _parse_voice_design_json(raw: str) -> dict:
    """Extrait le JSON voice design de la réponse LLM (tolérant aux fences markdown)."""
    import json
    import re

    text = raw.strip()
    # Retire les fences ```json ... ``` si présentes
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    # Isole le premier objet JSON {...}
    brace = re.search(r"\{.*\}", text, re.DOTALL)
    if brace:
        text = brace.group(0)

    data = json.loads(text)

    script = str(data.get("script") or "").strip()
    instruct = str(data.get("instruct") or "").strip()
    if not script or not instruct:
        raise ValueError("Réponse LLM incomplète : 'script' et 'instruct' requis.")

    allowed = {"temperature", "top_p", "top_k", "repetition_penalty",
               "subtalker_temperature", "subtalker_top_p", "subtalker_top_k"}
    params_raw = data.get("params") or {}
    params = {k: float(params_raw[k]) for k in allowed if k in params_raw and params_raw[k] is not None}

    return {"script": script, "instruct": instruct, "params": params}
