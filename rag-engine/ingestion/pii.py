"""
PII scrubbing — runs before any chunk is persisted to Qdrant/Supabase.
See docs/RAG_SECURITY.md §3 for the full policy this implements.
"""
from __future__ import annotations
import re

from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_analyzer.nlp_engine import NlpEngineProvider

# Explicit small-model config — presidio defaults to en_core_web_lg (400MB)
# which we don't need; en_core_web_sm (already installed) is plenty for
# PHONE_NUMBER/EMAIL_ADDRESS detection, and our PAN/Aadhaar/account regexes
# don't depend on the NLP model at all.
_NLP_CONFIGURATION = {
    "nlp_engine_name": "spacy",
    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
}
_nlp_engine = NlpEngineProvider(nlp_configuration=_NLP_CONFIGURATION).create_engine()

# India-specific patterns presidio's default recognizers don't cover out of the box.
_PAN_PATTERN = Pattern(name="pan_pattern", regex=r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", score=0.9)
_AADHAAR_PATTERN = Pattern(name="aadhaar_pattern", regex=r"\b\d{4}\s?\d{4}\s?\d{4}\b", score=0.7)
_ACCOUNT_NO_PATTERN = Pattern(
    name="account_no_pattern",
    regex=r"(?:account|a/c|acct)\D{0,10}(\d{9,18})",
    score=0.6,
)

_pan_recognizer = PatternRecognizer(supported_entity="IN_PAN", patterns=[_PAN_PATTERN])
_aadhaar_recognizer = PatternRecognizer(supported_entity="IN_AADHAAR", patterns=[_AADHAAR_PATTERN])
_account_recognizer = PatternRecognizer(supported_entity="IN_ACCOUNT_NO", patterns=[_ACCOUNT_NO_PATTERN])

_analyzer = AnalyzerEngine(nlp_engine=_nlp_engine, supported_languages=["en"])
_analyzer.registry.add_recognizer(_pan_recognizer)
_analyzer.registry.add_recognizer(_aadhaar_recognizer)
_analyzer.registry.add_recognizer(_account_recognizer)

_PLACEHOLDER = {
    "IN_PAN": "<PAN>",
    "IN_AADHAAR": "<AADHAAR>",
    "IN_ACCOUNT_NO": "<ACCOUNT_NO>",
    "PHONE_NUMBER": "<PHONE>",
    "EMAIL_ADDRESS": "<EMAIL>",
}

_ENTITIES_STRICT = ["IN_PAN", "IN_AADHAAR", "IN_ACCOUNT_NO", "PHONE_NUMBER", "EMAIL_ADDRESS"]
# Public/regulatory content: only structured identifiers, never names (those are
# legitimately public in e.g. news quotes) — see docs/RAG_SECURITY.md §3.
_ENTITIES_LIGHT = ["IN_PAN", "IN_AADHAAR", "IN_ACCOUNT_NO"]

# Our own patterns are scored 0.6-0.9 (see Pattern() definitions above). Presidio's
# context-aware scoring can emit unrelated near-zero-confidence "candidate" spans
# (observed: "community-powered" / "2026-05-18" tagged IN_PAN at score 0.05) — a
# threshold well above those phantom scores but below our real patterns filters
# them out without weakening genuine detection.
_SCORE_THRESHOLD = 0.5


def scrub(text: str, strict: bool = False) -> tuple[str, int]:
    """
    Returns (scrubbed_text, redaction_count).
    strict=True for user_doc sources (ITR, Form 16, bank statements).
    strict=False for public sources (regulation, news, finos_page) — defensive only.
    """
    entities = _ENTITIES_STRICT if strict else _ENTITIES_LIGHT
    results = _analyzer.analyze(text=text, entities=entities, language="en", score_threshold=_SCORE_THRESHOLD)
    if not results:
        return text, 0

    # Replace longest spans first so offsets for earlier matches aren't shifted
    results = sorted(results, key=lambda r: r.start, reverse=True)
    scrubbed = text
    for r in results:
        placeholder = _PLACEHOLDER.get(r.entity_type, f"<{r.entity_type}>")
        scrubbed = scrubbed[: r.start] + placeholder + scrubbed[r.end :]

    return scrubbed, len(results)
