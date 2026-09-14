"""
LLM-as-judge evaluation — Phase 7 (July 2026).

RAGAS 0.4.3 can't be imported (upstream packaging bug, attempted Phase 5 — see
docs/RAG_PHASES.md Phase 5 for the full failure trace). This module implements
the same three core metrics using Ollama qwen3:8b directly as the judge, which
is available on this machine, requires no extra dependencies, and aligns with
how the rest of the system avoids cloud LLM dependencies.

Three metrics, each scored 0.0–1.0 by qwen3:8b with explicit reasoning:

  FAITHFULNESS      — Is every factual claim in the answer supported by the
                      retrieved context? (1.0 = fully grounded, 0.0 = hallucinated)

  ANSWER RELEVANCE  — Does the answer directly address the user's question?
                      (1.0 = perfectly addresses it, 0.0 = completely off-topic)

  CONTEXT PRECISION — Of the retrieved chunks, how many were actually useful for
                      generating the answer? (1.0 = all useful, 0.0 = all noise)

Each metric is a separate Ollama call. Total cost per question: ~3 Ollama calls
at ~5-8s each on this hardware = ~15-25s per question. Run on a sample, not all
100 benchmark questions, to keep the evaluation time tractable.

Usage:
  cd rag-engine
  python3 evaluation/llm_judge.py                    # judge 10 random Qs
  python3 evaluation/llm_judge.py --n 20             # judge 20 Qs
  python3 evaluation/llm_judge.py --category TAX     # only TAX questions
  python3 evaluation/llm_judge.py --full             # all 100 Qs (slow, ~40min)
"""
from __future__ import annotations
import argparse
import json
import random
import re
import time

import httpx

OLLAMA_BASE = "http://localhost:11434"
JUDGE_MODEL = "qwen3:8b"
RAG_SERVER  = "http://localhost:7476"

_TIMEOUT = httpx.Timeout(90.0)


# ── Ollama judge call ────────────────────────────────────────────────────────

def _judge_call(prompt: str) -> str:
    """Send a prompt to qwen3:8b and return the plain text response."""
    resp = httpx.post(
        f"{OLLAMA_BASE}/api/generate",
        json={"model": JUDGE_MODEL, "prompt": prompt, "stream": False, "think": False,
              "options": {"temperature": 0.0, "num_predict": 120}},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("response", "").strip()


def _extract_score(text: str) -> float:
    """Pull the first float in 0-1 range out of the judge's response."""
    # Look for patterns like "Score: 0.8", "0.75", "score=0.9"
    matches = re.findall(r'\b(1\.0|0\.\d+)\b', text)
    if matches:
        return float(matches[0])
    # Also look for integer 1 or 0
    if re.search(r'\b1\b', text):
        return 1.0
    if re.search(r'\b0\b', text):
        return 0.0
    return 0.5  # uncertain


# ── The three metrics ────────────────────────────────────────────────────────

def score_faithfulness(question: str, answer: str, context_chunks: list[str]) -> float:
    """Is every factual claim in the answer supported by the retrieved context?"""
    context = "\n\n".join(f"[CHUNK {i+1}] {c}" for i, c in enumerate(context_chunks))
    prompt = f"""You are an impartial evaluator. Judge whether the Answer is fully grounded in the Context.

QUESTION: {question}

CONTEXT:
{context}

ANSWER: {answer}

Rate FAITHFULNESS (0.0 to 1.0):
- 1.0 = every factual claim in the Answer is directly supported by the Context
- 0.5 = most claims supported, minor unsupported details
- 0.0 = Answer contains significant claims NOT in the Context (hallucination)

Respond with one line: "Score: X.X" where X.X is your score, then one sentence of reasoning."""
    return _extract_score(_judge_call(prompt))


def score_answer_relevance(question: str, answer: str) -> float:
    """Does the answer directly and completely address the question?"""
    prompt = f"""You are an impartial evaluator. Judge whether the Answer addresses the Question.

QUESTION: {question}

ANSWER: {answer}

Rate ANSWER RELEVANCE (0.0 to 1.0):
- 1.0 = Answer directly and completely addresses the question
- 0.5 = Partially answers but misses some aspects or goes off-topic
- 0.0 = Answer is completely off-topic or refuses to answer

Respond with one line: "Score: X.X" where X.X is your score, then one sentence of reasoning."""
    return _extract_score(_judge_call(prompt))


def score_context_precision(question: str, answer: str, context_chunks: list[str]) -> float:
    """What fraction of the retrieved chunks were actually useful for the answer?"""
    if not context_chunks:
        return 0.0
    context_lines = "\n".join(f"[CHUNK {i+1}] {c[:300]}" for i, c in enumerate(context_chunks))
    prompt = f"""You are an impartial evaluator. Judge which retrieved chunks were actually used to generate the answer.

QUESTION: {question}
ANSWER: {answer}

RETRIEVED CHUNKS:
{context_lines}

Rate CONTEXT PRECISION (0.0 to 1.0):
- 1.0 = All chunks were relevant and used to answer the question
- 0.5 = About half the chunks were relevant
- 0.0 = None of the chunks were relevant (answer was from LLM knowledge, not context)

Respond with one line: "Score: X.X" where X.X is your score, then one sentence of reasoning."""
    return _extract_score(_judge_call(prompt))


# ── Full evaluation run ──────────────────────────────────────────────────────

def evaluate_question(q: dict) -> dict:
    """Run all three metrics for one benchmark question against the live RAG server."""
    started = time.time()

    # 1. Get RAG answer + retrieved chunks
    try:
        resp = httpx.post(
            f"{RAG_SERVER}/api/query",
            json={"query": q["query"], "stream": False, "top_k": 3,
                  "doc_type": q.get("doc_type")},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        answer = data.get("answer", "")
        citations = data.get("citations", [])
        # Reconstruct context chunk texts from citations (best available proxy)
        context_chunks = [c.get("chunk", c.get("text", "")) for c in citations if c]
    except Exception as e:
        return {
            "id": q["id"], "category": q["category"], "query": q["query"],
            "error": str(e), "faithfulness": None, "relevance": None, "precision": None,
        }

    if not answer:
        return {
            "id": q["id"], "category": q["category"], "query": q["query"],
            "error": "empty answer", "faithfulness": None, "relevance": None, "precision": None,
        }

    # 2. Score all three metrics
    faithfulness = score_faithfulness(q["query"], answer, context_chunks)
    relevance    = score_answer_relevance(q["query"], answer)
    precision    = score_context_precision(q["query"], answer, context_chunks)

    return {
        "id": q["id"],
        "category": q["category"],
        "query": q["query"],
        "answer_excerpt": answer[:200],
        "faithfulness":   round(faithfulness, 3),
        "relevance":      round(relevance, 3),
        "precision":      round(precision, 3),
        "avg_score":      round((faithfulness + relevance + precision) / 3, 3),
        "latency_sec":    round(time.time() - started, 1),
    }


def run(n: int = 10, category: str | None = None, full: bool = False) -> dict:
    from evaluation.benchmark import QUESTIONS

    pool = [q for q in QUESTIONS if category is None or q["category"] == category]
    if not full:
        pool = random.sample(pool, min(n, len(pool)))

    print(f"\n🔬 LLM-as-judge: evaluating {len(pool)} questions with {JUDGE_MODEL}\n")

    results = []
    for i, q in enumerate(pool, 1):
        print(f"[{i}/{len(pool)}] {q['id']} — {q['query'][:60]}...")
        r = evaluate_question(q)
        results.append(r)
        if "error" not in r:
            print(f"         F={r['faithfulness']:.2f}  R={r['relevance']:.2f}  P={r['precision']:.2f}  avg={r['avg_score']:.2f}")
        else:
            print(f"         ERROR: {r['error']}")

    # Aggregate
    valid = [r for r in results if "error" not in r]
    if valid:
        avg_f = sum(r["faithfulness"] for r in valid) / len(valid)
        avg_r = sum(r["relevance"]    for r in valid) / len(valid)
        avg_p = sum(r["precision"]    for r in valid) / len(valid)
        avg_a = sum(r["avg_score"]    for r in valid) / len(valid)
        print(f"\n{'='*55}")
        print(f"SUMMARY  {len(valid)}/{len(results)} questions scored successfully")
        print(f"  Faithfulness:      {avg_f:.3f}")
        print(f"  Answer Relevance:  {avg_r:.3f}")
        print(f"  Context Precision: {avg_p:.3f}")
        print(f"  Average:           {avg_a:.3f}")

    return {"results": results, "summary": {
        "scored": len(valid), "total": len(results),
        "faithfulness": round(avg_f, 3) if valid else None,
        "relevance":    round(avg_r, 3) if valid else None,
        "precision":    round(avg_p, 3) if valid else None,
        "avg_score":    round(avg_a, 3) if valid else None,
    } if valid else {}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LLM-as-judge RAG evaluation")
    parser.add_argument("--n",        type=int,  default=10, help="Number of questions to sample")
    parser.add_argument("--category", type=str,  default=None, help="Filter by category (TAX, REG, etc.)")
    parser.add_argument("--full",     action="store_true",    help="Run all 100 questions")
    args = parser.parse_args()
    run(n=args.n, category=args.category, full=args.full)
