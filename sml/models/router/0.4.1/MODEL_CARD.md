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
