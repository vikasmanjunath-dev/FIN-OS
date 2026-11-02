# sml/ — FIN-OS small-model work

Source of truth: `TRACKER.md` (every step with evidence) and `PLAN.md` (what and why, founder decisions); `ROADMAP.md` is the route from today to the end state. Strategy: the "FIN-OS SML Blueprint" doc.

| Path | What |
|---|---|
| `data/router_data.py` | Templated router data (train, valid held out by template, natural_test) |
| `data/incoming/` + `data/ingest_incoming.py` | Independently written messages from blind writers; ingest dedupes (exact and near-duplicate) across every set and writes dev, dev3, test_v2..test_v8, train_extra, train_extra2 (deterministic; older files stay byte-identical when a new set is added; `MANIFEST.json` holds the hashes) |
| `training/train_router.py`, `train_router_v2.py` | Training. `--version` is required for v2 and an existing version is never overwritten without `--overwrite`. A retrain reproduces 0.4.1 exactly (TRACKER H4) |
| `training/eval_fresh.py` | Scores a FROZEN router on a fresh set; nothing is fit or tuned |
| `runtime/router_predict.py` | Predictor (Ollama embedding + TF-IDF/embedding heads); default version 0.4.1; served by `POST /api/route` |
| `models/router/<ver>/` | `MODEL_CARD.md`, `eval.json`, `SHA256SUMS` and the small pickle-free files (`embed_lr.npz`, `tfidf_head.json/npz`) are trackable; `tfidf_lr.joblib` (a pickle) and the 3.7 MB browser file are git-ignored (retrain to recreate; the predictor falls back to the tracked export). Versions: 0.4.1 = shadow default, 0.5.1 = candidate, 0.5.0 = rejected record |
| `verifier/` | Faithfulness-verifier experiments; verdict NO-GO for an automated gate (`REPORT.md`) |
| `eval/` | Frozen-model evaluation outputs (router sealed-set scores, taxonomy, contamination check, tf-idf-only, figures check) and `eval/golden/`: the typed retrieval golden set (91 English items) with its recall@k harness |
| `tests/` | Python: leakage guards (held-out sets never overlap training), verifier data, predictor. `tests/js/`: node tests for the browser modules in `js/sml/` |
| `../js/sml/tfidf-router.js` | Browser-side port of the TF-IDF head (not wired); weights file made by `training/export_tfidf_web.py`, parity fixture in `tests/js/fixtures/` |
| `scripts/verify.sh` | One command: model checksums, python and JS test totals |
| `docs/` | `LABELLING_GUIDE.md`, the blueprint PDF exports, `founder/` (CA review of tax notes, counsel questions, topology and devices, consent text draft) |
| `tools/` | `review_sheet.py` (label review sheets, kappa, adjudication list), `check_figures.py` (verifies `rules/figures.json` against the pages it cites) |
| `rules/` | `figures.json`: 15 tax figures with the exact source sentence (D10 first slice) |
| `categoriser/` | Transaction-categoriser spec, evaluation harness and rule baseline (plumbing only until real rows exist; the in-app row export is `js/sml/categoriser-export.js`) |
| `eval/golden/review/` | `review_page.py` builds the local review page for the 40 draft Hindi/Hinglish questions (`index.html`); `rescore_review.py` re-scores mxbai vs bge-m3 from the reviewed verdicts only |
| `../html/help-improve.html` | DRAFT opt-in page for the local-only export of redacted flagged messages (not linked from anywhere) |
| `tools/claims/` | Verifier gate-set labelling: `build_pool.py` (candidate claims from the live engine, no labels), `label_claims.html` (local page), `claims_report.py` (kappa vs the two earlier labellers + gate-set files in `verifier/` format) |
| `tools/review/` | Blind router label review: `build_candidates.py`, `router_review.html`, `router_review_report.py` (kappa, disagreements, proposed label changes in `data/proposed/`, never into held-out files) |
| `tools/pulse/` | `replay.py`: PULSE offline replay harness (IPS / SNIPS / replay, safety net, written gate; synthetic logs only so far) |
| `tools/categoriser/` + `categoriser/CONTRIBUTOR_GUIDE.md` | `validate_rows.py` rejects dirty contributor files; the guide is the one-page instructions for friends |
| `../js/sml/` (browser) | `router-shadow.js`, `router-advisory.js`, `sample-capture.js`, `categoriser-export.js`, `pulse-counters.js`, `report.js`, `tfidf-router.js`, `numeric-check.js`, `normalizer.js`. All opt-in, default off (flags in `docs/ARYA_AI.md`) |

Held-out sets (test_v2..test_v6, natural_test) are never trained or tuned on. `training/.embed_cache.npz` is a local cache tagged with its embedding model and can be deleted.
Run the tests: `rag-engine/.venv/bin/pytest sml/tests rag-engine/evaluation/test_*.py -q` and `node --test tests/*.test.js sml/tests/js/*.test.js`.

**Rule: all SML work (data, models, docs, tests, scripts) lives under `sml/`.** The one exception is the browser code in `js/sml/`: pages load it as `/js/sml/*.js`, so it must stay under the served `js/` folder. Its tests are in `sml/tests/js/`.
