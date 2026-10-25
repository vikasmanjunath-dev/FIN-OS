# SML working plan and log

Single place for: where we are, what is being built next, how each item is accepted, what only the founder can unblock, and what was decided. Companion to the "FIN-OS SML Blueprint" Claude Doc (strategy, Parts 0-18); this file is the execution layer. Update it in the same change as the work. Last updated: 2026-10-25.

Full route from today's verified state to the end state (phases, gates, blockers, data plan, timeline): [ROADMAP.md](ROADMAP.md).

## 1. State (verified, not aspirational)

| Area | State | Evidence |
|---|---|---|
| RAG engine | Healthy; 123 pages + SEBI/RBI/IRDAI/PFRDA + news indexed (~2,000 chunks); worker auto-restarts; Ollama has NUM_PARALLEL=2, KEEP_ALIVE=30m | `docs/RAG_STATUS.md` (generated), `docs/RAG_PHASES.md` Phase 9 |
| Public benchmark | 95-96/112 (about 85%; was 76/100 at baseline, 93 before the reranker window) | `rag-engine/evaluation/benchmark.py` |
| Personalized benchmark | 38/41 on the latest run (39 on the run before, same three failures PD-05, PG-04, PL-01: run noise), zero cross-user leaks | `rag-engine/evaluation/benchmark_personal.py` |
| Router 0.4.1 | Predictor default and shadow-week model. One-shot test_v6 (217): macro-F1 0.966, guard recall 53/53, false alarm 4.3% (limits: single set, 4-7% false alarm across sets). Shadow mode only; NOT an active guard (F3) | `sml/models/router/0.4.1/MODEL_CARD.md`, TRACKER C14-C16 |
| Number checker + facts gaps | Live in Arya, fail-open, loaded on demand | `js/sml/*`, `js/finos-facts.js`, 67 tests |
| Regression tests | 590+ JS tests and 58 python tests (sml + rag-engine evaluation), all passing at last run (TRACKER bottom) | `npm test`-style commands in section 6 |

Known weak points: router app_help/document_help and spend/summary confusions; generation still does its own arithmetic (benchmark PD-05); public pages can outrank a person's own "not provided" facts (PX-01); 20 of the original 100 benchmark questions still fail; everything the router learned from is author- or agent-written.

## 2. Principles that govern every item (from the blueprint, binding)
1. Numbers come from tools or sources, never from model text. 2. Skip rather than guess; no invented defaults. 3. Nothing user-visible changes without a flag, a measured gate and a rollback. 4. Held-out data is never used to fit or tune; leakage is tested. 5. Personal data stays on the device; every new network flow is declared in `js/finos-privacy.js` FLOWS. 6. Add guards, never remove `AryaGuardrails`.

## 3. Workstreams, in build order

Status key: TODO / DOING / DONE / BLOCKED(who).

### W1 Router in shadow mode  [DONE and browser-verified; waiting for the founder's week of real use]
Goal: learn how the router behaves on REAL messages without changing any answer.
- W1.1 DONE (server.py `/api/route` + metrics `ROUTER_DECISIONS`; rag-engine/evaluation/test_route_endpoint.py, 5 tests; needs server restart). `POST /api/route` in rag-engine returning the router decision (intent, confidence, risk, needs_guard). Local only. Test: contract + no personal data logged.
- W1.2 DONE (js/sml/router-shadow.js + routerShadow() in js/arya-sidebar-panel.js; tests/sml-router-shadow.test.js, 15 tests; FLOWS 'ai' entry amended). Arya panel calls it non-blocking after each user message when flag `finos_sml_router_shadow` is on (default OFF); stores only counters in localStorage: intent, risk class, needs_guard, agree/disagree with `AryaGuardrails` flags. NEVER the text.
- W1.4 DONE 2026-10-25 real-browser run: flag off = 0 requests; flag on, 5 messages = counters moved, no text stored, 56-122 ms; flag removed = 0 requests again (TRACKER C9).
- W1.3 DONE (`AryaSidebar.routerStats()` returns {stats, summary, enabled}; stubbed in js/arya-lazy.js, where it returns a Promise). `AryaSidebar.routerStats()` + a one-line view for the founder.
Accept: flag off = zero requests; flag on = no change to any answer, no text stored, counters correct, FLOWS entry present, tests pass. Gate to leave shadow: >= 300 real messages, founder review of disagreements.

### W2 Verifier data and baseline  [DONE; final decision NO-GO for an automated gate (W2.6-W2.8, TRACKER D8); see sml/verifier/REPORT.md]
Goal: a domain NLI verifier to replace the noisy off-the-shelf one (RAG_PHASES Phase 5 finding).
- W2.1 Synthetic claim/evidence generator from indexed chunks: entailed (extractive sentence), contradicted (number/entity perturbation), unsupported (sentence from an unrelated chunk). Exact labels by construction; hand-check 100.
  - STATUS: done 2026-10-25. `sml/verifier/gen_claims.py`; 934/class (742 train, 192 test), split by page group, hand-check 60 final rows: 0 wrong (earlier versions 4 and 1 wrong, fixed). Pool-limited below the 1,200 target.
- W2.2 Baseline: current `nli-deberta-v3-base` guard and the numeric checker on that set, per class.
  - STATUS: done. Guard alone: not-supported precision 0.761 / recall 0.971, 61% of verbatim-entailed claims falsely flagged; numeric alone 1.00 / 0.13; combined 0.761 / 0.971. Gate (0.90/0.80) missed on precision only.
- W2.3 Result (2026-10-25, `sml/verifier/REPORT.md`): on 2,802 synthetic rows (934/class, split by page group, 60-row hand check 0 wrong) the current NLI guard has precision 0.761 / recall 0.971 for "not supported" (gate 0.90 / 0.80): it wrongly flags 61% of VERBATIM supported sentences. The numeric checker alone: precision 1.00, recall 0.13 (catches 95% of number changes, blind to negation and polarity). Combined = NLI alone. Verdict: conditional GO. Order: (a) cheap, untested: best-matching-sentence premise instead of the whole chunk, and a tuned entailment margin (needs logits kept); (b) only if (a) misses the gate: fine-tune a small DeBERTa/LoRA with paraphrased entailed claims plus >= 300 real claims labelled by the founder; full base fine-tune needs ~6-8 GB free (Ollama paused).
- W2.4 DONE 2026-10-25 (`sml/verifier/experiments.py`, REPORT.md section W2.4): premise = best-matching sentence (top1) + margin tau tuned on a val split of train gives test P 0.997 / R 0.948 (extractive) and P 1.000 / R 0.948 (139 rule-paraphrased entailed; 0 of 40 hand-checked wrong, 8 weakened shall->will); gate met on synthetic data, but the selector finds the source sentence 192/192 so it flatters; numeric OR adds +0.005 recall. Margin alone on the full premise does nothing. Verdict: fine-tune NO-GO for now; next W2.5 = >= 300 real labelled claims as the gate set, then engine change (best 1-2 sentences, flagged) and re-measure, fine-tune only if the real set misses 0.90.
- W2.5 DONE 2026-10-26 real claim set (241 claims from the engine's answers, 2 blind labelers, kappa 0.77). RESULT: the NLI guard fails on REAL answers even with best-sentence premise + tuned margin: precision 0.17 / recall 0.88 (76% of correct sentences falsely flagged) vs 0.997 on synthetic. Synthetic success did not transfer; fine-tune on synthetic = NO-GO; do not use the NLI guard as a gate. Detail in `sml/verifier/REPORT.md` W2.5.
- W2.6-W2.8 DONE (2026-10-27): one-word judges (qwen3:8b/14b, gemma3:12b), decomposition judges (8b, 14b), number co-location and judge combinations were all measured on 224 agreed real rows. Best single judge: qwen3:14b decomposition P 0.68 / R 0.44 at 13.5 s per claim; best combination for precision: 2 of 3 judges P 0.90 / R 0.27. Gate (P 0.90, R 0.80) NOT met by anything. **Decision: NO-GO for an automated verifier gate**; numeric check stays; the lever is data (founder-labelled >= 300 claims, F4) or an opt-in advisory 'double-check' (not built). Larger generator (qwen3:14b) also tested: no gain, 2.5x latency.
  - FINAL (superseded the earlier GO): NO-GO for an automated gate, see W2.6-W2.8 above.
Accept: report with per-class precision/recall and a written go/no-go. Gate (blueprint 9.5): "unsupported" flag precision >= 0.90, recall >= 0.80.

### W3 Retrieval quality  [PAUSED at 95-96/112; the >=100 target is NOT met; the cheap levers are used up, see below]
Goal: fewer wrong or missing facts. Targets: the 20 failing public questions, PX-01/PG-04/PH-03.
- W3.1 DONE (2026-10-25) triage of the 20 failing public questions by cause (gold = the expected text): A answer present in the prompt (generation or label issue) 9; B partial 2; C answer at rank 4-10 (ranking) 6; D not in the top 10 3 (F-03 and D-02 are indexed, so these are ranking misses; PF-02's circular is off PFRDA's listing).
- W3.2 Fixes, each measured:
  - DONE reranker scores the query-relevant window instead of the chunk head (it truncates at 256 tokens, so for long chunks the answer was outside what it read): answer-in-prompt 9 -> 12 of 20, T-02 (80D limit) now rank 1. `retrieval/reranker.py`, `config.RERANK_WINDOW_CHARS`.
  - TESTED, NOT ADOPTED candidate pool 10+10 -> 20+20: one more question reaches the prompt (13 vs 12) for about +0.9 s per query. Kept at 10; env `RAG_RETRIEVE_K` overrides.
  - DONE benchmark confirmation: public 93 -> 96 / 112 (95 on a re-run through the live server; treat as +2 to +3). Personalized had slipped 38 -> 35 because of corpus growth (news 92 -> 1,000 chunks), proven by re-running the OLD retrieval (also 35).
  - DONE personal quota (`retrieval/personal.py`): first-person questions get a guaranteed slot for the caller's own chunk; personalized back to 38/41, isolation 5/5. Personal prior x4 tested and left OFF (no benefit).
  - DONE news tested: 4.8% of top-3 slots on public questions; demotion x0.3 changed 0 of 15 affected questions -> shipped OFF (`config.NEWS_DEMOTION`). Cache key now includes all tunables (`config.pipeline_signature()`).
  - DONE class-A triage: most are real generation errors (number borrowed from a neighbouring sentence), not label problems. Quote-first prompt tested: 90/112 vs 95-96 -> rejected (`RAG_PROMPT_VARIANT`, default base). Next levers: verifier that catches misattribution (W2.5), larger generator for fact questions (latency cost), shorter contexts.
  - TODO personal-namespace boost for "my ..." questions (PX-01 / PG-04), only after W1 shadow data shows how often it matters.
- W3.3 Router-driven retrieval filters: after W1 shadow results.
Accept: public benchmark >= 100/112 with no regression on personalized, each fix in `docs/RAG_PHASES.md` with before/after.

### W4 Router 0.4  [0.4.1 built on blind-writer data; real-message gate BLOCKED on the founder]
- Real consented messages (needs U3: feedback endpoint + consent text) or shadow counters plus founder-labelled disagreements.
- Label review of boundary cases (founder + one other person), ~300 risky test messages to test the 0.99 recall target, more Devanagari.
Accept: macro-F1 >= 0.95 on a fresh set; high-risk recall >= 0.99 with a lower bound reported.

### W5 Transaction categoriser  [BLOCKED on founder: redacted statements]
Pipeline (features, 13 categories, abstain below 0.55, JSON export for JS) is specified in the blueprint (Part 8.3) but gains cannot be measured on synthetic merchants: the current regex rules would label them. Needs ~1,000+ real redacted statement rows with the user's own correct categories. Do not start on synthetic data alone.

### W6 Personalization / learning engine  [groundwork DONE, ranker blocked on usage data]
Groundwork DONE 2026-10-25: local-only PULSE impression/tap counters (`js/sml/pulse-counters.js`, flag `finos_pulse_counters_on`, default off, `AryaSidebar.pulseStats()`, 12 tests, browser-verified; TRACKER G1).
PULSE ranker (bandit with rule safety net), concept graph + learning-path recommender (blueprint Part 12). Needs interaction signals; start by logging impressions/taps as local counters.

### W7 On-device runtime  [TODO, Phase 3]
Browser encoder (transformers.js / ONNX), WebGPU feature test, model shard delivery, device lab. Needs D1 (topology) and D7 (devices).

### W8 Embedding bake-off (blueprint D3)  [TODO, needs download approval]
Compare mxbai-embed-large with bge-m3 and Qwen3-Embedding-0.6B on recall@5 over the benchmark questions, in English, Hinglish and Hindi. Requires pulling models through Ollama (about 0.6-1.2 GB each) while memory is tight.

### Next steps plan (set 2026-10-25, in order)
1. **Collect (founder, ~1 week, no work for me):** in your own browser set `localStorage.finos_sml_router_shadow='1'` and `finos_pulse_counters_on='1'`, use FIN-OS normally, then run `await AryaSidebar.smlReport()` in the console. Gate to leave shadow mode: `ready:true` (>= 300 messages) plus your review of the disagreements.
2. **C10 / C14 / C15: DONE** (fresh blind sets, router 0.4.1; see TRACKER). Next router step is only possible with real messages (step 1) or a second label reviewer (F4).
3. **W3.3 router-driven retrieval filters:** after step 1, only if shadow data shows intents where a doc_type filter would help.
4. **W6 ranker:** only after the PULSE counters show enough taps; first a bandit with the rule ranker as the safety net, behind a flag, compared offline on the counters before any live use.
5. **Blocked, unchanged:** F1-F8 above.

## 4. Decisions and inputs only the founder can give

| # | Item | Why it blocks | Default if no answer |
|---|---|---|---|
| F1 | Redacted bank/UPI statement rows with correct categories (>= 1,000) | W5 | W5 stays blocked |
| F2 | Feedback endpoint + consent text + retention rule (blueprint D4 / PENDING U3) | W4 real data | Local counters only |
| F3 | Go-ahead to move the router from shadow to active guard, and the acceptable false-alarm rate (about 3% to 5%) | W1 exit | Stays shadow |
| F4 | Second person to review boundary labels | W4 | Author labels only |
| F5 | Topology D1 (recommended: on-device-first hybrid), reference devices D7 | W7 | Server path only |
| F6 | Approve model downloads for the bake-off | W8 | Skipped |
| F7 | Counsel on the 10.9 questions | Public launch | Education-only design stays |
| F8 | Free some memory (a security scanner, a VM and a qemu process were the largest users per `top`; swap was ~25 GB) | Speed of everything | Queries stay 2-3x slower |

## 5. Risks being managed
- Overfitting to agent-written text: mitigated by independent writers, fresh test sets, leakage tests; real messages are the real fix (W4).
- Label noise on boundary cases: documented in the model card; review planned (F4).
- Memory pressure: heavy jobs run one at a time; servers stopped for in-process benchmarks; Monitor instead of long sleeps.
- Shadow mode privacy: counters only, never text; flag default off.

## 6. How to run things (commands)
```bash
# engine health + counts
rag-engine/.venv/bin/python scripts/rag_status.py
# engine start (also applies Ollama env)
rag-engine/start-all.sh
# benchmarks
cd rag-engine && .venv/bin/python evaluation/benchmark.py --json out.json
cd rag-engine && .venv/bin/python evaluation/benchmark_personal.py --json out.json   # stop the server first (memory)
# router: data -> ingest -> train -> predict
python3 sml/data/router_data.py && rag-engine/.venv/bin/python sml/data/ingest_incoming.py
rag-engine/.venv/bin/python sml/training/train_router_v2.py --version 0.5.0   # --version is required; an existing version is refused without --overwrite
rag-engine/.venv/bin/python sml/runtime/router_predict.py "your message"
# tests
rag-engine/.venv/bin/pytest sml/tests rag-engine/evaluation/test_*.py -q
node --test tests/*.test.js
```
Never commit from the assistant; commit messages carry no AI attribution (founder rule).

## 7. Log
| Date | Entry |
|---|---|
| 2026-10-14 | Blueprint doc created; audit found engine stale and docs lagging code |
| 2026-10-15/17 | Engine health pass: 422 bug, chunker loop, dedupe, prompt window, scheduler grace, worker loop; benchmarks 76->81 public, 38/41 personal |
| 2026-10-17 | Number checker + facts gaps wired into Arya; Ollama env applied; router 0.1.0 built |
| 2026-10-25 | W2 done: verifier synthetic set (2,802 rows) + baseline; guard precision 0.76 vs gate 0.90 (false flags on supported claims); conditional GO on fine-tune, see sml/verifier/REPORT.md |
| 2026-10-26 | W2.5 real claims: NLI guard precision 0.17 on real answers (0.997 on synthetic) -> synthetic fine-tune NO-GO; trying LLM judge |
| 2026-10-25 | W2.4 cheap variants: top1 premise + val-tuned margin reaches the gate on synthetic data (P 0.997 / R 0.948; paraphrased P 1.0), fine-tune deferred until a real labelled claim set exists; see REPORT.md W2.4 |
| 2026-10-25 | Router 0.2.0/0.3.0 with independent data; leakage bug found by tests and fixed; this plan written; W1 and W2 started |
| 2026-10-25 | W1 built (`/api/route` verified live: advice request flagged 0.999); W2 baseline done; W3 triage + reranker window |
| 2026-10-25 | Reranker window: public 93 -> 96/112. Personalized 38 -> 35 traced to news growth (old code also 35); personal quota restores 38/41. Prior x4 rejected (no gain) |
| 2026-10-25 | C9 browser run done; A13/A14 dropped with evidence; B13 (2x500 = 91, 3x300 = 93 vs 95-96) rejected; PULSE counters built (W6 groundwork); double-check advisory (E6) left unbuilt: needs 3 LLM calls per answer on a swapping machine, not cheap | 
| 2026-10-25 | W1.1-W1.3 built: /api/route, router-shadow.js counters, panel hook (flag finos_sml_router_shadow, default off); tests green; needs server restart + founder review |

**2026-10-25 C10 result:** fresh blind set (232 scored) on frozen router 0.3.0: macro-F1 0.941 (CI 0.907-0.969), guard recall 0.90 / false alarm 2.1% at thr 0.2. Gate 0.95 not met; guard recall is the number to improve before any active mode (F3), since the earlier 89/89 was measured on easier sets. Next: C14 (new train data, then a further fresh test set). See TRACKER C10/C14.

**2026-10-25 C14 result:** router 0.4.0 (600 new targeted training messages) on the unseen test_v5: macro-F1 0.908 -> 0.960 (CI 0.926-0.986), guard recall 30/30, but guard false alarms 9.3% at thr 0.15 (target 3-5%). Candidate, not wired. Next: C15 = new dev set to re-choose the threshold, then a further fresh confirmation. Model card: sml/models/router/0.4.0/MODEL_CARD.md.

**2026-10-25 C15 result:** router 0.4.1 (threshold re-chosen on a 424-message dev set: 0.20) on the one-shot confirmatory test_v6 (217): macro-F1 0.966 (CI 0.938-0.988), guard recall 53/53, false alarm 4.3%; all three gates met on this set, with the limits listed in sml/models/router/0.4.1/MODEL_CARD.md (single set, recall bound ~0.94, false alarm 4-7% across sets). Still a candidate; real shadow-mode messages decide. Open: C16 which version the shadow week uses.

**2026-10-25 C16:** shadow mode now uses router 0.4.1 (predictor default; counters record `by_version`). Collect for a week, then `await AryaSidebar.smlReport()`.
