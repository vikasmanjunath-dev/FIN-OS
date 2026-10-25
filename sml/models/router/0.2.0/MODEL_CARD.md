# Model card: router 0.2.0 (candidate, NOT released, NOT wired into Arya)

**Purpose** Route a message (13 intents) and flag the two high-risk intents (advice-seeking, tax evasion) so a guard runs. Blueprint use cases 1 and 6. Supersedes 0.1.0.
**Rung** 1+2 blend: TF-IDF (word 1-2 + char 2-5 grams) logistic regression and `mxbai-embed-large` (Ollama, 1024-dim) logistic regression, probabilities blended 0.7 embedding / 0.3 TF-IDF (weight chosen on dev). Artifacts: `tfidf_lr.joblib`, `embed_lr.npz` (also stores the dev-chosen guard threshold). Predictor: `sml/runtime/router_predict.py`.
**Training data** 1,220 messages: 610 template-generated + 610 written by an independent writer blind to the templates; final refit adds valid (185) and dev (161). Synthetic, no personal data. Hashes: `sml/data/MANIFEST.json`.
**Evaluation sets** (none used for fitting or tuning): `natural_test` 130 (written by the template author), `test_v2` 192 (independent writer, blind to this repo's data). Combined N=322. `dev` (161, independent writer) was used ONLY to choose C, the blend weight and the guard threshold. Exact and near-duplicates between sets were removed (`ingest_incoming.py`).

| Model (combined test, N=322) | accuracy (95% CI) | macro-F1 | risky requests reaching a guard |
|---|---|---|---|
| rules (today's regex + keyword gate) | 0.112 (0.078-0.146) | 0.07 | 0.14 |
| TF-IDF | 0.891 (0.857-0.925) | 0.892 | 0.90 |
| embedding | 0.882 (0.845-0.916) | 0.883 | 0.84 |
| **blend (this card)** | **0.938 (0.910-0.963)** | **0.939** | 0.94 by argmax |

By writer: natural_test (mine) 0.946; test_v2 (independent) 0.932. By language (N is small): Hinglish 0.963, English 0.937, Devanagari Hindi **0.84 (about 40 messages)**.
**Gates (Part 9, 9.5):** macro-F1 0.939 vs target 0.95 **not met** (interval straddles it); high-risk recall target 0.99 **met only at a noisy operating point** (below).

**Guard rule** `needs_guard` = regex guards OR P(advice)+P(evasion) >= threshold. Trade-off on the combined test (50 risky, 272 benign):

| threshold | risky caught | benign flagged |
|---|---|---|
| **0.10 (chosen on dev; the default)** | 50/50 (100%) | 18.4% |
| 0.20 | 49/50 (98%) | 3.3% |
| 0.30 | 49/50 (98%) | 1.8% |
| 0.40 | 48/50 (96%) | 0.4% |
| 0.50 | 39/50 (78%) | 0.4% |

The dev-chosen rule (largest threshold that reaches 99% recall on dev, where only 28 messages are risky) lands at 0.10, which would flag about one benign message in five. Whether the 0.2-0.3 region is acceptable is a product decision (a flag adds a guard pass or a note, it does not refuse); choosing it from this table is choosing on the test set, so **confirm on a fresh set before shipping**. The old 0.1.0 estimate (20/20 at 4.5%) was optimistic, as that card warned.
**Where it is weak** `personal_spend_query` vs `personal_money_summary` (3+1 swaps), `app_help` vs `document_help` (3), out-of-scope messages containing money words read as advice (2), personal_spend_query F1 0.88, app_help 0.90.
**Limits** one writer pair, no real user messages yet; labels on boundary messages are debatable (the writers flagged examples like "is sip safe"); test N is 322 (+/-3 points); Devanagari Hindi is thin; no multi-turn context; the blend needs an Ollama embedding call (~0.1 s warm) so it cannot yet run in the browser (Phase 3).
**Leakage fix (Oct 25 2026):** the first run of this card had 9 short messages (greetings, "reliance share price") present in both a held-out set and the generated training/valid text; `ingest_incoming.py` now drops them from dev/test and `sml/tests` guards it (numbers moved by under 0.01).
**Reproduce** `python3 sml/data/router_data.py`, put the three agent files in `sml/data/incoming/`, `python3 sml/data/ingest_incoming.py`, then `rag-engine/.venv/bin/python sml/training/train_router_v2.py`. Numbers: `eval.json`.
**Next** collect real (consented, redacted) messages; tune thresholds on a fresh dev set; add Devanagari data; then add as an extra guard beside `AryaGuardrails`, never replacing it.
