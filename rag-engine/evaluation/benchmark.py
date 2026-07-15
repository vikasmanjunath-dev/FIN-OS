"""
Indian finance accuracy benchmark — scoped down from the originally-planned
100 fabricated questions to 10 real ones, each verified against actual indexed
source text before being written here (see docs/RAG_PHASES.md Phase 5 for why).

Scoring is substring-match, not an LLM judge — RAGAS (which would do the latter)
isn't wired up yet. Each question's `expect` is a list of fact-groups; a group
is itself a list of acceptable spellings/phrasings of the same fact (OR within
a group), and every group must be satisfied (AND across groups). This is a
blunt instrument: it'll pass an answer that includes the right number with
wrong surrounding reasoning, and fail a correct answer that spells a number
out in words. Treat results as a directional signal, not a certified score.

Run: cd rag-engine && source .venv/bin/activate && python3 evaluation/benchmark.py
"""
from __future__ import annotations
import time
import httpx

SERVER = "http://localhost:7476"

# Each question's `expect` groups were checked against real retrieved source
# text (via storage.sqlite_fts.search) before being added here — not assumed.
QUESTIONS = [
    {
        "query": "How is insurance cover calculated in FIN-OS?",
        "doc_type": None,
        "expect": [["20"], ["debt"]],
        "source": "FIN-OS Shield Protocol page: 'Cover = (Annual Income × 20) + Total Debt'",
    },
    {
        "query": "If I earn 10 lakhs per year and have a 50 lakh home loan, how much term insurance cover do I need per the FIN-OS formula?",
        "doc_type": None,
        "expect": [["2.5"], ["crore"]],
        "source": "Same page's worked example: ₹10L income + ₹50L loan = ₹2.5 Crore Term Plan",
    },
    {
        "query": "What percentage of income can professionals declare as profit under Section 44ADA presumptive taxation?",
        "doc_type": None,
        "expect": [["50%"]],
        "source": "FIN-OS Tax Protocol: 'earning up to ₹75 Lakhs can declare 50% as profit'",
    },
    {
        "query": "What is the income tax surcharge rate for income between 50 lakhs and 1 crore?",
        "doc_type": None,
        "expect": [["10%"]],
        "source": "FIN-OS Tax Protocol: 'Income ₹50L–₹1Cr → 10% surcharge'",
    },
    {
        "query": "What is the additional NPS tax deduction available under Section 80CCD(1B)?",
        "doc_type": None,
        "expect": [["50,000", "50000"]],
        "source": "FIN-OS Tax Protocol: 'Section 80CCD Extra ₹50,000'",
    },
    {
        "query": "What percentage of donations to the PM Relief Fund qualify for deduction under Section 80G?",
        "doc_type": None,
        "expect": [["100%"]],
        "source": "FIN-OS Tax Protocol: 'PM Relief Fund & CM Relief Fund get 100% deduction'",
    },
    {
        "query": "What is the long-term capital gains tax rate on gold, and what holding period qualifies as long-term?",
        "doc_type": None,
        "expect": [["24 months"], ["12.5%"]],
        "source": "FIN-OS Tax Protocol: 'holding period for LTCG: 24 months ... LTCG (> 24 months): 12.5%'",
    },
    {
        "query": "Per SEBI's guidelines on winding up of AIFs, what is the maximum period for retaining funds to meet residual winding-up expenses?",
        "doc_type": "regulation",
        "expect": [["three years", "3 years"]],
        "source": "SEBI circular HO/19/34/11(2)2026-AFD-POD1: 'shall not exceed three years from the end of permissible fund life'",
    },
    {
        "query": "What does the RBI's Kisan Credit Card Scheme directions for Small Finance Banks cover?",
        "doc_type": "regulation",
        "expect": [["kisan"], ["credit card"]],
        "source": "RBI direction title itself: 'Small Finance Banks - Kisan Credit Card (KCC) Scheme'",
    },
    {
        "query": "How is insurance cover calculated, and what is the NPS 80CCD(1B) deduction limit?",
        "doc_type": None,
        "expect": [["debt"], ["50,000", "50000"]],
        "source": "Compound question spanning two of the facts above — tests whether a single retrieval pass surfaces both, without multi_hop",
    },
]


def _passes(answer: str, expect_groups: list[list[str]]) -> bool:
    lower = answer.lower()
    return all(any(alt.lower() in lower for alt in group) for group in expect_groups)


def run() -> list[dict]:
    passed = 0
    results = []
    for q in QUESTIONS:
        started = time.time()
        try:
            resp = httpx.post(
                f"{SERVER}/api/query",
                json={"query": q["query"], "stream": False, "doc_type": q["doc_type"]},
                timeout=60.0,
            )
            resp.raise_for_status()
            answer = resp.json().get("answer", "")
        except Exception as e:
            answer = f"[ERROR: {e}]"
        elapsed = time.time() - started

        ok = _passes(answer, q["expect"])
        passed += int(ok)
        results.append({"query": q["query"], "pass": ok, "latency_sec": round(elapsed, 2), "answer_excerpt": answer[:150]})

        status = "PASS" if ok else "FAIL"
        print(f"[{status}] ({elapsed:.1f}s) {q['query']}")
        if not ok:
            print(f"         expected (all groups): {q['expect']}")
            print(f"         got: {answer[:200]}")

    total = len(QUESTIONS)
    print(f"\n{passed}/{total} passed ({100 * passed / total:.0f}%)")
    return results


if __name__ == "__main__":
    run()
