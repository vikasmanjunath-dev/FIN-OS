# sml/ — FIN-OS small-model work

Source of truth: `TRACKER.md` (every step with evidence) and `PLAN.md` (what and why, founder decisions); `ROADMAP.md` is the route from today to the end state. Strategy: the "FIN-OS SML Blueprint" doc.

| Path | What |
|---|---|
| `data/router_data.py` | Templated router data (train, valid held out by template, natural_test) |
| `data/incoming/` + `data/ingest_incoming.py` | Independently written messages from blind writers; ingest dedupes across every set and writes dev, test_v2..test_v6, train_extra (output is deterministic; `MANIFEST.json` holds the hashes) |
| `training/train_router.py`, `train_router_v2.py` | Training. `--version` is required for v2 and an existing version is never overwritten without `--overwrite`. A retrain reproduces 0.4.1 exactly (TRACKER H4) |
| `training/eval_fresh.py` | Scores a FROZEN router on a fresh set; nothing is fit or tuned |
| `runtime/router_predict.py` | Predictor (Ollama embedding + TF-IDF/embedding heads); default version 0.4.1; served by `POST /api/route` |
| `models/router/<ver>/` | `MODEL_CARD.md` and `eval.json` are tracked; `embed_lr.npz` and `tfidf_lr.joblib` are git-ignored (retrain to recreate) |
| `verifier/` | Faithfulness-verifier experiments; verdict NO-GO for an automated gate (`REPORT.md`) |
| `eval/` | Frozen-model evaluation outputs |
| `tests/` | Leakage guards (held-out sets never overlap training), verifier data, predictor |

Held-out sets (test_v2..test_v6, natural_test) are never trained or tuned on. `training/.embed_cache.npz` is a local cache tagged with its embedding model and can be deleted.
Run the tests: `rag-engine/.venv/bin/pytest sml/tests rag-engine/evaluation/test_*.py -q` and `node --test tests/*.test.js`.
