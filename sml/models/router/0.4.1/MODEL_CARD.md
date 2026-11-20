# Model card: router 0.4.1 (candidate; NOT an active guard; predictor default and shadow-mode model since 2026-10-25, TRACKER C16)

Same architecture and training text as 0.4.0 (TF-IDF LR + mxbai-embed-large LR, blend weight 0.5), trained on 610 templated + 1,354 independently written messages. What changed (C15): the dev set grew from 145 to 424 messages (146 risky, 278 benign, many benign messages that contain risky-sounding words such as "black money", "guaranteed", "benami", "hawala"), and the guard threshold was re-chosen on it: **0.20** (highest threshold with dev recall >= 0.99; dev recall 0.993, false alarm 8.3% because dev is deliberately hard). Final artifact is refit on train + valid + dev.

**Confirmatory set test_v6** (217 messages, two writers who saw nothing, written AFTER the threshold rule was fixed; one-shot):

| Artifact | Accuracy | Macro-F1 (95% CI) | Guard recall | Guard false alarm |
|---|---|---|---|---|
| 0.4.1 shipped (refit), thr 0.20 | 0.963 | **0.966 (0.938-0.988)** | **53/53** | **7/164 = 4.3%** |
| 0.4.1 train-script model (pre-refit) | 0.954 | 0.958 | 53/53 | 5/164 = 3.0% |
| 0.4.0 shipped, its thr 0.15 | 0.954 | 0.958 (0.929-0.981) | 53/53 | 11/164 = 6.7% |

Gates (macro-F1 >= 0.95, recall >= 0.99, false alarm <= 5%): met on test_v6 by the shipped artifact. **Limits, read these:** (1) one set of 217 is one draw; the F1 interval's lower end (0.938) is below 0.95; (2) 53/53 recall only bounds true recall above about 0.94 at 95% (rule of three), not 0.99; (3) false alarm varies by set: test_v5 6.6% (10/151), older 568 messages 5.2%, dev 8.3%, test_v6 4.3%, so expect 4-7% on harder text; (4) test_v5/test_v4 are no longer unseen for this model family; (5) all text is agent-written. Real consented messages from shadow mode (>= 300) remain the decisive test, and the active-mode decision (F3) is the founder's.

Files: `eval.json` (train-script numbers, includes guard curves; the test_v6 curve is information only and was not used to choose), data hashes in `sml/data/MANIFEST.json`.

**Reproducibility record (F9):** embeddings from Ollama `mxbai-embed-large:latest`, image digest `468836162de7` (2026-10-25). Checksums of the artifacts: `SHA256SUMS` in this folder (the `.npz` and `.joblib` files are git-ignored; retrain with `train_router_v2.py --version X`, which reproduced 0.4.1 exactly on 2026-10-25, TRACKER H4). If the embedding digest changes, expect different vectors and re-verify.

**Sealed test_v7 (2026-10-26, scored once, TRACKER C19):** 983 messages from six new blind writers (333 risky, 650 benign incl. risk-word look-alikes). macro-F1 0.9448 (CI 0.929-0.957, point below 0.95); guard recall 333/333 (Clopper-Pearson lower bound 0.991); note-level false alarm 11.85% (gate 5%, FAILED). The false alarms are mostly non-finance "should I ... / which is best to buy" messages (weather, clothes, phones, recipes) that the router reads as advice. Read the earlier 'gates met' statement (test_v6) together with this: recall holds on both sets, the false-alarm rate does not. Do not show a note to other people on the strength of this model; a new version needs new out_of_scope / look-alike TRAIN data and a new sealed set.

**On-device TF-IDF head (2026-10-26, TRACKER C13):** the TF-IDF half of this router also runs in the browser (`js/sml/tfidf-router.js`, flag `finos_sml_router_local`, default off, server `/api/route` as fallback, labelled `0.4.1-tfidf`). It is a recall-first signal like the blend, NOT a blocking guard: on the sealed test_v7 it scored macro-F1 0.928, recall 332/333 (lower bound 0.986) and a note-level false alarm of 11.7%, so it fails the F1 and false-alarm gates (the blend: 0.9448 and 11.85%, also failing the false-alarm gate). Guard threshold 0.10 on the head's risk mass. Parity with the Python head: identical intent and guard flag on all 3,028 held-out rows. File: 699 KB gzipped (2.96 MB raw). Latency 0.19 ms per message in one desktop browser; reference phones (D7) were not available, so mobile latency is unmeasured.
