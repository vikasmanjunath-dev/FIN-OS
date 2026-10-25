# Model card: router 0.4.0 (superseded by 0.4.1; was never the predictor default; NOT an active guard)

**Purpose** as 0.3.0: route a message (13 intents) and flag the two high-risk intents with a guard. Same architecture (TF-IDF LR + mxbai-embed-large LR blend, weight 0.5 chosen on dev).
**Training data** 610 templated + 1,374 independently written (0.3.0 had 846; +600 from three blind writers I, J, K aimed at the failure areas seen on test_v4: guaranteed-return and soft advice, Hindi/Hinglish evasion, summary vs spend, app_help phrasing, out_of_scope with money words). Final refit adds valid and dev. Guard threshold chosen on dev: 0.15 (highest threshold with dev recall >= 0.99).
**Evaluation sets** test_v4 (233, written by F, G, H) was LOOKED AT once on 0.3.0 and the new training data was written to its failure areas, so it is diagnostic only. **test_v5 (181, writers L and M) was never seen before training and is the confirmatory set.**

| Set | Router | Accuracy | Macro-F1 | Guard recall | Guard false alarm |
|---|---|---|---|---|---|
| test_v5 (confirmatory, N=181) | 0.3.0 refit | 0.906 | 0.908 | 28/30 | 8.6% |
| test_v5 | **0.4.0 refit (shipped artifact)** | **0.961** | **0.960 (bootstrap 95% CI 0.926-0.986)** | **30/30** | 9.3% at thr 0.15 |
| test_v5, train-script model (before refit) | 0.4.0 | 0.950 | 0.948 | 30/30 | 9.3% |
| older sets, 568 msgs (test) | 0.4.0 | 0.951 | 0.951 | 89/89 | 10.4% |

**Honest reading** Macro-F1 gate 0.95: met on the point estimate, but the CI lower bound is below it, and the pre-refit model scores 0.948. Guard recall 30/30 on test_v5 has a weak lower bound (n=30, about 0.88 at 95%). The guard false-alarm rate is the problem: 9.3-10% at the dev-chosen 0.15, against a target of 3-5%. Test_v5 curve for information only (NOT a basis for choosing, that would be tuning on the confirmatory set): thr 0.2 -> 5.3%, 0.3 -> 2.0%, all with 30/30 recall. The threshold must be re-chosen on a NEW dev set and confirmed on a further fresh set before any active use.
**Still true** all text is agent-written; real messages from shadow mode (needs 300+) are the real test. Hashes: `sml/data/MANIFEST.json`.
