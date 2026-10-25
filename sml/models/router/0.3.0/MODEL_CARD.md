# Model card: router 0.3.0 (candidate; NOT released; NOT wired into Arya)

**Purpose** Route a message (13 intents) and flag the two high-risk intents (advice-seeking, tax evasion) so a guard runs. Blueprint use cases 1 and 6. Supersedes 0.2.0.
**Rung** 1+2 blend: TF-IDF (word 1-2 + char 2-5) logistic regression and `mxbai-embed-large` logistic regression, probabilities blended 0.5/0.5 (weight chosen on dev). Predictor: `sml/runtime/router_predict.py` (needs Ollama for the embedding; about 0.1 s warm; not yet browser-capable).
**Training data** 1,456 messages: 610 templated, 846 independently written (English, Hinglish and 260 Devanagari Hindi). Final refit adds valid (185) and dev (148). Synthetic, no personal data. Hashes: `sml/data/MANIFEST.json`.
**Evaluation sets** (never used to fit or tune): `natural_test` 130 (template author), `test_v2` 187 (independent writer A), `test_v3` 251 (independent writer B, a *fresh* set added after all tuning decisions). Combined N=568. `dev` (148, independent) chose C, the blend weight and the guard threshold only. Exact and near-duplicates are removed between every pair of sets; `sml/tests` enforces it.

| Model (combined test, N=568) | accuracy (95% CI) | macro-F1 |
|---|---|---|
| rules (today's regex + keyword gate) | 0.114 (0.090-0.141) | 0.071 |
| TF-IDF | 0.924 (0.900-0.944) | 0.924 |
| embedding | 0.879 (0.852-0.905) | 0.879 |
| **blend** | **0.944 (0.924-0.963)** | **0.943** |

By set: natural_test 0.946, test_v2 0.930, test_v3 0.952. By language: English 0.946, Hinglish 0.957, Devanagari Hindi 0.916.
**Gates (Part 9, 9.5):** macro-F1 0.943 vs target 0.95 **not met** (0.7 points short; the interval straddles it). High-risk recall: see below.

**Guard rule** `needs_guard` = regex OR P(advice)+P(evasion) >= **0.20** (chosen on dev). The threshold was then checked on `test_v3`, which nothing was tuned on:

| threshold | test_v3 (fresh): risky caught / benign flagged | older test sets: risky caught / benign flagged |
|---|---|---|
| 0.10 | 39/39 / 11.8% | 100% / 13.9% |
| **0.20 (chosen)** | **39/39 (100%) / 4.7%** | 100% / 5.6% |
| 0.30 | 39/39 / 3.3% | 98% / 2.6% |
| 0.40 | 39/39 / 2.4% | 96% / 1.5% |
| 0.50 | 38/39 / 0.9% | 90% / 1.1% |

Observed: 89 of 89 risky requests caught across all test sets. With that count the 95% lower bound on recall is about 96.7%, so **the 0.99 recall target cannot be confirmed statistically yet** (that needs roughly 300 risky test messages). The 0.2 threshold did generalise from dev to a fresh set, which was the open question on 0.1.0 and 0.2.0.
**Where it is weak** `app_help` read as `document_help` (4), `personal_spend_query` vs `personal_money_summary` (5 swaps), out-of-scope messages containing money words read as advice or evasion (4), advice_seeking F1 0.90, app_help F1 0.90.
**Limits** Every message is written by the template author or by agents; there is no real user text yet. test_v3 is cleaner and easier than the others (even TF-IDF scores 0.956 on it), so the headline average is a little flattering. Boundary labels are debatable (for example "what is section 80C" was labelled concept_explainer by one writer, which this project's taxonomy would call regulation_question); label noise caps the achievable score. Devanagari Hindi has about 120 test messages. No multi-turn context.
**Reproduce** `python3 sml/data/router_data.py`; put the five agent files in `sml/data/incoming/`; `python3 sml/data/ingest_incoming.py`; `rag-engine/.venv/bin/python sml/training/train_router_v2.py`. Numbers: `eval.json`.
**Next** Wire in as an *additional* guard (never replacing `AryaGuardrails`) once real consented messages exist to re-check; review boundary labels; collect about 300 risky test messages to test the 0.99 recall target; an on-device encoder for Phase 3.
