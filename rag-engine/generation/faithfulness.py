"""
Faithfulness guard — post-generation NLI entailment check (Phase 5).
See docs/RAG_PIPELINE.md Layer 6 and docs/RAG_EVALUATION.md §2.

Checks each cited sentence in a generated answer against its [SOURCE_N] chunk:
is this sentence actually entailed by the source, or did the model add/embellish
something the source doesn't support? Uncited sentences (the model's own
reasoning/summary, per the system prompt's rules) are not checked — that's
by design, not a gap.

KNOWN LIMITATION, measured not assumed: cross-encoder/nli-deberta-v3-base is
confident and correct on the everyday-register sentences it was trained on
(SNLI/MultiNLI — e.g. "A man is playing a guitar" -> "A person plays an
instrument" = entailment, score 4.36) but unreliable on Indian regulatory/
financial register text with specific dates and scheme names. Measured: a
genuinely-correct paraphrase of an RBI KCC directive's effective date got
"neutral" against the full source chunk, and "contradiction" against an
almost-verbatim-matching shortened premise — i.e. results that flip on
premise framing rather than tracking actual semantic support. This is a
domain mismatch in the off-the-shelf model, not a bug in this code. Treat
flagged_sentences as a noisy review signal, not a reliable accept/reject gate,
until a domain-appropriate NLI model is evaluated (not attempted this pass).
"""
from __future__ import annotations
import re

import torch
from sentence_transformers import CrossEncoder

_MODEL_NAME = "cross-encoder/nli-deberta-v3-base"
_SOURCE_TAG = re.compile(r"\[SOURCE_(\d+)\]")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")

_model: CrossEncoder | None = None
_label2id: dict[str, int] | None = None


def _get_model() -> tuple[CrossEncoder, dict[str, int]]:
    global _model, _label2id
    if _model is None:
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        _model = CrossEncoder(_MODEL_NAME, device=device)
        # Same bug as the reranker (docs/RAG_MODELS.md §5) — constructor's device
        # arg alone doesn't move the model on this sentence-transformers version.
        _model.model.to(device)
        # Don't assume label order (varies by model card) — read it from the
        # model's own config instead of hardcoding ["contradiction","entailment","neutral"].
        id2label = _model.model.config.id2label
        _label2id = {v.lower(): k for k, v in id2label.items()}
    return _model, _label2id


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]


def check_faithfulness(answer_text: str, ranked_chunks: list[dict]) -> list[dict]:
    """
    Returns a list of {sentence, cited_source, label, score} for every cited
    sentence that did NOT get an 'entailment' label from the NLI model — i.e.
    sentences the source doesn't actually support. Empty list = nothing flagged.
    """
    model, _ = _get_model()

    flagged = []
    for sentence in _split_sentences(answer_text):
        matches = _SOURCE_TAG.findall(sentence)
        if not matches:
            continue  # uncited — not a sourced factual claim, not checked by design

        # A sentence can cite multiple sources; it's faithful if entailed by AT LEast one.
        clean_sentence = _SOURCE_TAG.sub("", sentence).strip()
        best_label = None
        best_score = -1.0
        is_entailed = False

        for idx_str in matches:
            idx = int(idx_str)
            if idx < 1 or idx > len(ranked_chunks):
                continue
            source_text = ranked_chunks[idx - 1]["payload"].get("text", "")
            if not source_text:
                continue

            scores = model.predict([(source_text, clean_sentence)])
            predicted_idx = int(scores[0].argmax()) if hasattr(scores[0], "argmax") else int(max(range(len(scores[0])), key=lambda i: scores[0][i]))
            predicted_label = model.model.config.id2label[predicted_idx].lower()
            predicted_score = float(scores[0][predicted_idx])

            if predicted_label == "entailment":
                is_entailed = True
                break
            if predicted_score > best_score:
                best_score = predicted_score
                best_label = predicted_label

        if not is_entailed and best_label is not None:
            flagged.append({
                "sentence": clean_sentence,
                "cited_sources": [f"SOURCE_{m}" for m in matches],
                "label": best_label,
                "score": round(best_score, 3),
            })

    return flagged
