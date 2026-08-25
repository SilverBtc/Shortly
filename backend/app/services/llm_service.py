"""Service LLM : client OpenAI-compatible (OpenAI, OpenRouter, Groq, Ollama, vLLM)."""
from __future__ import annotations

import logging
import re
from typing import Any

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# Prompt du Wizard Étape 4 — aligné sur le Voice Design (mêmes règles de script).
WIZARD_SCRIPT_PROMPT = """Tu es le meilleur scénariste de vidéos courtes virales TikTok (format storytelling immersif POV métier / narration vécue à la 1ère personne).

MISSION :
L'utilisateur te fournit des notes brutes, des idées ou un résumé d'une situation. Tu dois transformer cela en un script TikTok captivant, conversationnel et divertissant.

CONTRAINTES DE DURÉE STRICTES :
- Le script doit faire STRICTEMENT entre 135 et 155 mots français pour durer entre 61 et 66 secondes à l'oral (~2,4 mots/seconde). Ne JAMAIS écrire moins de 135 mots : sous-estimer la durée est la pire erreur.
- Rédige TOUJOURS à la première personne du singulier (« je »).

RÈGLES D'ÉCRITURE :
- Phrases courtes et punchy, style TikTok conversationnel, langage parlé naturel.
- HUMOUR & BRAIN ROT : intègre naturellement 2 à 4 mots ou expressions du vocabulaire TikTok viral (skibidi, rizz, gyatt, sigma, goated, cooked, aura, NPC, delulu, no cap, main character, L, W, ratio, mewing, glazing, brainrot, sus, bet, fr, periodt...) pour divertir et faire rire. On préfère une formule amusante qui fait sourire à une logique parfaite : le sens peut être légèrement bancal, l'absurde est bienvenu. Les mots brain rot s'intègrent naturellement dans le récit, jamais en liste forcée.

STRUCTURE VIRALE OBLIGATOIRE :
1. Hook (0-3s) : Une phrase choc ou absurde qui accroche immédiatement la curiosité ou pose un dilemme anormal.
2. Corps du récit (3-50s) : Actions concrètes, détails sensoriels, vocabulaire immersif et punchy. Pas de phrases complexes.
3. Cliffhanger / Loop (50-62s) : Fin abrupte sur une révélation ou une ouverture intrigante qui incite à commenter.

AUCUNE balise SSML ([pause], [rapide]...) : la prosodie est gérée par la voix, pas par des balises. Pas de guillemets ni de caractères spéciaux exotiques.

Sortie : Renvoie UNIQUEMENT le texte final du script à lire à voix haute. Aucun mot d'introduction ni de conclusion."""

VIRAL_SCRIPT_PROMPT = """Tu es le meilleur scénariste de vidéos courtes virales sur TikTok (format storytelling immersif / POV métier à la 1ère personne).

OBJECTIF :
Rédiger un récit captivant à la première personne (« je »), rythmé, immersif et conversationnel, calibré STRICTEMENT pour durer entre 61 et 66 secondes à l'oral (entre 135 et 155 mots en français parlé).

RÈGLES DE RÉTENTION & STRUCTURE :
1. HOOK (0-3s) : Une phrase choc ou absurde qui pose une situation anormale, un conflit ou une intrigue directe.
2. DÉVELOPPEMENT (3-50s) : Raconte l'histoire avec des détails sensoriels et visuels qui collent au métier. Phrases courtes, punchy, langage parlé naturel (pas de style littéraire ou académique).
3. CLIFFHANGER / LOOP (50-62s) : L'histoire doit monter en tension et se terminer sur une coupure nette ou une réflexion intrigante qui donne envie de commenter ou de revoir la vidéo.

HUMOUR & BRAIN ROT :
Intègre naturellement 2 à 4 mots ou expressions du vocabulaire TikTok viral (skibidi, rizz, gyatt, sigma, goated, cooked, aura, NPC, delulu, no cap, main character, L, W, ratio, mewing, glazing, brainrot, sus, bet, fr, periodt...) pour divertir et faire rire. On préfère une formule amusante qui fait sourire à une logique parfaite : le sens peut être légèrement bancal, l'absurde est bienvenu. Les mots brain rot s'intègrent naturellement dans le récit, jamais en liste forcée.

CONTRAINTES STRICTES :
- Ne jamais mettre de texte de présentation, d'explication ou de salutation.
- Renvoyer UNIQUEMENT le texte du script à lire à voix haute, SANS balises SSML ni ponctuation inutile.
- Longueur totale : entre 135 et 155 mots."""

VOICE_DESIGN_PROMPT = """Tu es le meilleur directeur artistique vocal pour TikTok. Tu maîtrises parfaitement le modèle Qwen3-TTS-12Hz-1.7B-VoiceDesign qui génère une voix à partir d'une description en langage naturel (instruct).

MISSION :
À partir d'une description de situation vidéo fournie par l'utilisateur ET d'une durée cible en secondes, tu produis :
1. Le script complet à faire dire par la voix (en français, calibré pour la durée).
2. L'instruct de design vocal : une description riche et précise de la voix idéale pour ce contexte.
3. Les paramètres d'échantillonnage optimaux.

RÈGLES DU SCRIPT :
- Calibrage durée : ~2,4 mots/seconde à l'oral en français parlé. Pour une durée D secondes, écris entre D×2,2 et D×2,6 mots (ex : 30s → 66-78 mots). Ne JAMAIS écrire moins de D×2,2 mots : sous-estimer la durée est la pire erreur.
- Écrit à la première personne (« je »), style TikTok conversationnel, phrases courtes et punchy.
- HUMOUR & BRAIN ROT : intègre naturellement 2 à 4 mots ou expressions du vocabulaire TikTok viral (skibidi, rizz, gyatt, sigma, goated, cooked, aura, NPC, delulu, no cap, main character, L, W, ratio, mewing, glazing, brainrot, sus, bet, fr, periodt...) pour divertir et faire rire. On préfère une formule amusante qui fait sourire à une logique parfaite : le sens peut être légèrement bancal, l'absurde est bienvenu. Les mots brain rot doivent s'intégrer naturellement dans le récit (ex : « ce mec avait un aura de ouf », « totalement sigma », « elle était delulu »), jamais en liste forcée.
- Structure : HOOK choc ou absurde dans les 3 premières secondes → développement immersif et drôle → fin qui donne envie de commenter.
- AUCUNE balise SSML ([pause], [rapide]...) : le modèle VoiceDesign gère la prosodie via l'instruct.
- Pas de guillemets ni de caractères spéciaux exotiques.

RÈGLES DE L'INSTRUCT VOIX (le plus important) :
- Décris la voix comme un casting : genre, âge approximatif, timbre (grave/aigu/rauque/doux), débit, énergie, émotion dominante, intention (confession, urgence, mystère...), respiration, micro-détails vocaux (légèrement enrouée, sourire audible...).
- LANGUE DE L'INSTRUCT : écris l'instruct dans la MÊME langue que le script (donc en français si le script est en français). Un instruct rédigé en anglais appliqué à un script français produit un accent anglophone dérangeant — à éviter absolument.
- ACCENT FRANÇAIS OBLIGATOIRE : précise TOUJOURS que la voix parle français avec un accent français natif, authentique et naturel (jamais d'accent étranger).
- TON OBLIGATOIRE : la voix doit TOUJOURS être remplie d'énergie, vivante et engageante — débit soutenu, rapide et CONTINU, sans blancs ni pauses parasites, énergie haute et positive, ton direct et captivant. L'intention peut varier (confession, urgence, mystère, excitation) mais JAMAIS de ton plat, monotone ou lent, JAMAIS de blancs. Reste vivant et dynamique SANS tomber dans la théâtralité épique ou la voix de bande-annonce : la voix doit sonner comme un créateur TikTok survolté et naturel qui raconte une histoire sans reprendre son souffle.
- Longueur : 2 à 4 phrases riches.
- Cohérente avec la situation : une confession intime ≠ un tutoriel énergique (mais les deux restent dynamiques).

RÈGLES DES PARAMÈTRES (plages autorisées) :
- temperature: 0.8-1.0 (défaut 0.9 : vif et dynamique ; 1.0 = très expressif sans excès)
- top_p: 0.85-0.95
- top_k: 20-60
- repetition_penalty: 1.0-1.1
- subtalker_temperature: 0.9-1.1 (prosodie/rythme — 1.0 = débit vivant et dynamique ; au-delà de 1.1 = théâtral à éviter)
- subtalker_top_p: 0.85-0.95
- subtalker_top_k: 20-60
Pour un rendu dynamique et énergique (sans théâtralité), choisis des valeurs moyennes-hautes (temperature ~0.9, subtalker ~1.0).

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

# Prompt utilisé quand le script généré est trop court pour la durée cible :
# on redemande au LLM de l'allonger sans changer l'histoire.
LENGTHEN_SCRIPT_PROMPT = """Tu es un éditeur de scripts TikTok. Ton rôle : allonger un script existant pour atteindre exactement un nombre de mots cible, SANS changer l'histoire ni le style.

RÈGLES :
- Garde le hook d'origine (les 2-3 premières phrases), le narrateur à la 1ère personne, le ton et le cliffhanger final.
- Enrichis le développement : détails sensoriels, actions concrètes, micro-événements, montée en tension.
- Phrases courtes, conversationnelles, punchy. Pas de balises SSML.
- Objectif : le nombre de mots demandé par l'utilisateur (ni moins, ni beaucoup plus).
- Renvoie UNIQUEMENT le texte du script allongé, sans introduction ni conclusion."""

# Baseline d'énergie TikTok + accent français : ajoutés à l'instruct si le
# LLM les a oubliés. IMPORTANT : ces suffixes sont en FRANÇAIS — un suffixe
# anglais sur un script français fait dévier le modèle vers un accent anglophone.
TIKTOK_ENERGY_SUFFIX = (
    "Débit soutenu, rapide et continu, sans blancs ni pauses, énergie haute et "
    "positive, ton vivant et engageant, jamais monotone, sans théâtralité excessive."
)
FRENCH_ACCENT_SUFFIX = "Accent français natif et authentique, comme un natif francophone."

# --- Curseur d'énergie (anti-épique mais dynamique) ---------------------------
# Plus subtalker_temperature est haut, plus la prosodie est expressive.
# 1.0 = vivant et dynamique ; >1.1 = théâtral.
NATURAL_TEMPERATURE = 0.9
NATURAL_SUBTALKER_TEMPERATURE = 1.0
MIN_TEMPERATURE = 0.8
MAX_TEMPERATURE = 1.0
MIN_SUBTALKER_TEMPERATURE = 0.9
MAX_SUBTALKER_TEMPERATURE = 1.1
_ENERGY_KEYWORDS = (
    "energ", "dynam", "punch", "rapid", "fast", "vif", "rythm", "entrain",
    "vital", "tonique", "vivant", "captiv", "intens", "péchu", "pechu",
)
_ACCENT_KEYWORDS = (
    "accent", "français natif", "francophone", "native french", "french accent",
    "francais natif", "parisien", "français authentique", "francais authentique",
)


def _count_words(text: str) -> int:
    """Nombre approximatif de mots d'un script (séparation sur espaces)."""
    return len([w for w in text.split() if any(c.isalnum() for c in w)])


def _strip_punctuation(text: str) -> str:
    """Retire la ponctuation d'un script — source de pauses/blancs non voulus
    dans la voix finale (le modèle VoiceDesign gère la prosodie via l'instruct,
    pas via les virgules/points).

    - Supprime : . , ; : ! ? … « » “ ” ( ) [ ] { } — –
    - Garde : lettres, chiffres, accents, apostrophes (j'ai) et traits d'union
      (peut-être) qui font partie intégrante des mots français.
    - Normalise les apostrophes unicode (’) et les espaces multiples.
    """
    text = text.replace("’", "'")
    text = re.sub(r"[.,;:!?…«»“”\"()\[\]{}–—]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    # Recoller les espaces autour des apostrophes / tirets : "j' ai" -> "j'ai"
    text = re.sub(r"\s+'\s*", "'", text)
    text = re.sub(r"\s*'\s+", "'", text)
    text = re.sub(r"\s*-\s*", "-", text)
    return text


def _ensure_energy(instruct: str) -> str:
    """Garantit que l'instruct porte la baseline d'énergie TikTok.

    Si la description ne mentionne aucune notion d'énergie/dynamisme, on
    ajoute le suffixe énergie (l'oubli le plus courant du LLM).
    """
    low = instruct.lower()
    if any(kw in low for kw in _ENERGY_KEYWORDS):
        return instruct
    return f"{instruct} {TIKTOK_ENERGY_SUFFIX}"


def _ensure_french_accent(instruct: str) -> str:
    """Garantit que l'instruct impose un accent français natif et authentique.

    Sans mention d'accent, le modèle peut produire un accent anglophone
    dérangeant pour l'audience française.
    """
    low = instruct.lower()
    if any(kw in low for kw in _ACCENT_KEYWORDS):
        return instruct
    return f"{instruct} {FRENCH_ACCENT_SUFFIX}"


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
                "final. Ajoute naturellement 2-4 mots brain rot (skibidi, rizz, sigma, aura, cooked...). "
                "135-155 mots, SANS balises SSML. Renvoie UNIQUEMENT le script."
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
            "le ton captivant et les mots brain rot. "
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
        result = _parse_voice_design_json(raw)

        # --- Garde-fou 1 : durée ------------------------------------------------
        # Le LLM sous-produit souvent les mots (~35% de moins que la cible).
        # Si le script est trop court pour la durée demandée, on demande une
        # rallonge (jusqu'à 2 tentatives) sans changer l'histoire.
        target_words = int(round(duration_s * 2.4))  # ~2,4 mots/s à l'oral
        min_ok = int(target_words * 0.85)
        for attempt in range(2):
            if _count_words(result["script"]) >= min_ok:
                break
            result["script"] = await self._lengthen_script(result["script"], target_words)
            logger.info(
                "Voice Design : script trop court (%.0fs) — rallonge n°%d (%d mots)",
                duration_s, attempt + 1, _count_words(result["script"]),
            )

        # --- Garde-fou 2 : énergie TikTok + accent français obligatoires --------
        result["instruct"] = _ensure_energy(result["instruct"])
        result["instruct"] = _ensure_french_accent(result["instruct"])

        # --- Garde-fou 3 : script sans ponctuation -------------------------------
        # Les virgules/points génèrent des pauses et des blancs non voulus dans la
        # voix finale (le modèle VoiceDesign gère la prosodie via l'instruct).
        result["script"] = _strip_punctuation(result["script"])

        # --- Garde-fou 3 : params dans la plage naturelle (anti-épique) ----------
        # On borne temperature/subtalker pour éviter la prosodie théâtrale.
        params = result.get("params") or {}
        params["temperature"] = min(
            max(float(params.get("temperature", NATURAL_TEMPERATURE)), MIN_TEMPERATURE),
            MAX_TEMPERATURE,
        )
        params["subtalker_temperature"] = min(
            max(float(params.get("subtalker_temperature", NATURAL_SUBTALKER_TEMPERATURE)), MIN_SUBTALKER_TEMPERATURE),
            MAX_SUBTALKER_TEMPERATURE,
        )
        params.setdefault("top_p", 0.9)
        params["top_p"] = min(float(params["top_p"]), 0.95)
        params.setdefault("top_k", 40)
        params["top_k"] = int(min(float(params["top_k"]), 60))
        params.setdefault("repetition_penalty", 1.05)
        params.setdefault("subtalker_top_p", 0.9)
        params["subtalker_top_p"] = min(float(params["subtalker_top_p"]), 0.95)
        params.setdefault("subtalker_top_k", 40)
        params["subtalker_top_k"] = int(min(float(params["subtalker_top_k"]), 60))
        result["params"] = params

        return result

    async def _lengthen_script(self, script: str, target_words: int) -> str:
        """Allonge un script jusqu'à ~target_words mots (même histoire, même style)."""
        user = (
            f"Voici un script TikTok :\n\n{script}\n\n"
            f"Ce script est trop court : il doit atteindre environ {target_words} mots "
            "pour durer la durée cible à l'oral. Allonge-le pour atteindre ce nombre "
            "de mots en enrichissant le développement (détails sensoriels, actions, "
            "micro-rebondissements). Renvoie UNIQUEMENT le script allongé."
        )
        return await self._chat(
            [{"role": "system", "content": LENGTHEN_SCRIPT_PROMPT}, {"role": "user", "content": user}],
            temperature=0.8,
        )


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
