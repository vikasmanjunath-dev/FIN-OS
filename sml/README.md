# sml/ — FIN-OS small-model work (see the SML Blueprint doc, Parts 7-9)

| Path | What |
|---|---|
| `data/router_data.py` | Router dataset generator (templated train/valid held out by template + hand-written natural test) |
| `training/train_router.py` | Trains and compares rules / TF-IDF / embedding / ensemble; writes `models/router/<ver>/` |
| `runtime/router_predict.py` | Dev predictor (Ollama embedding + logistic head) |
| `models/router/0.1.0/` | Artifacts, `eval.json`, `MODEL_CARD.md` (candidate; gates not met) |
| `tests/` | Leakage and determinism tests |

Next models (blueprint Phase 2): transaction categoriser (needs real labelled rows), NLI verifier, retrieval fine-tune.
`training/.embed_cache.npz` is a local cache of embeddings and can be deleted.
