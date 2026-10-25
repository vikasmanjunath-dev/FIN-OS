# SML tracker (every step, with evidence)

Rule: after EVERY step add or update a row here (status + evidence: file, test or number) before moving on. `PLAN.md` = what and why; this file = what happened and what is next. Status: DONE / DOING / TODO / BLOCKED(who) / DROPPED(why). Updated: 2026-10-25 (audit pass 2, section H; roadmap F8).

## Summary
| Area | Done / dropped | Open | Blocked on founder |
|---|---|---|---|
| A Engine health | 14 | 0 | 0 |
| B Retrieval quality | 13 | 0 | 1 (B14) |
| C Router | 13 | 0 | 3 (C11, C12, C13) |
| D Verifier | 12 | 0 | 1 (D9) |
| E Arya integration | 6 | 0 | 1 (E7) |
| F Docs, plan, memory | 8 | 0 | 0 |
| G W6 groundwork | 2 | 0 | 1 (G2, needs real usage data) |
| H Audit pass 2 | 19 | 0 | 0 |

## A Engine health
| ID | Step | Status | Evidence |
|---|---|---|---|
| A1 | Restart Qdrant + server + worker (`start-all.sh`) | DONE | `/api/health` ok |
| A2 | Re-index 123 pages (297 -> 346 chunks) | DONE | job result, `RAG_STATUS.md` |
| A3 | Fix `/api/search` + `/api/retrieve` HTTP 422 (decorator vs postponed annotations) | DONE | `test_endpoint_signatures.py` |
| A4 | Fix chunker infinite loop (hung PFRDA job) | DONE | `test_chunker.py` |
| A5 | Dedupe manual regulation/corporate crawls by content_hash | DONE | `jobs.py`, IRDAI re-run skipped 98 |
| A6 | First ingest of IRDAI + PFRDA | DONE | 128 + 325 chunks |
| A7 | Worker restart loop in `start-all.sh` | DONE | killed worker came back |
| A8 | Scheduler misfire grace 6 h + coalesce | DONE | `scheduler.py` |
| A9 | Ollama `NUM_PARALLEL=2`, `KEEP_ALIVE=30m` applied durably | DONE | `ensure-ollama-env.sh`, process env checked |
| A10 | Cache key includes all tunables (`config.pipeline_signature()`) | DONE | `config.py` |
| A11 | Generated status file + stale docs corrected | DONE | `scripts/rag_status.py`, `docs/RAG_STATUS.md` |
| A12 | News ingestion verified working | DONE | 1,000 news chunks |
| A13 | `corporate_filing` has no scheduler job (0 chunks) | DROPPED (2026-10-25, leave manual) | Ran both crawlers with limit=5 today: NSE `/api/home-corporate-announcements` returned no data, BSE API returned HTTP 403, 0 filings each. A schedule would only add jobs that fail silently. Revisit only if the exchange access is fixed (needs a founder-approved data source). |
| A14 | PF-02 PFRDA circular no longer on listing page | DROPPED (2026-10-25, kept as a known corpus gap) | The listing page (200 OK, latest items only) has no pagination link and no DISHA circular; retrieve for the PF-02 query returns only the Pension Bulletin, none containing 'Informed Decision'. Question left in the benchmark, counted as a failure, so the score is not flattered; no older-circular URL available without a founder-supplied source. |

## B Retrieval quality (benchmarks)
| ID | Step | Status | Evidence |
|---|---|---|---|
| B1 | Baseline public 76/100; NEWPG 5/12 | DONE | Phase 9 table |
| B2 | Add 12 NEWPG questions + `--json` flag | DONE | `benchmark.py` |
| B3 | Personalized benchmark (41 q, isolation checks) | DONE | `benchmark_personal.py` |
| B4 | Prompt keeps query-relevant 500-char window (was first 500) | DONE | `test_prompt_window.py` |
| B5 | Reranker scores query window (was chunk head) | DONE | public 93 -> 95-96 / 112 |
| B6 | Wider candidate pool 20+20 | DROPPED | +1 q for +0.9 s |
| B7 | Personal prior x4 | DROPPED | no gain (35/41) |
| B8 | Personal quota (own namespace guaranteed 1 slot) | DONE | personalized 35 -> 38/41, `test_personal_quota.py` |
| B9 | News demotion x0.3 | DROPPED | 0 of 15 questions changed |
| B10 | Quote-first prompt | DROPPED | 90/112 vs 95-96 |
| B11 | 9 failing questions are real generation errors (number borrowed from neighbour) | DONE (finding) | triage list in `RAG_PHASES.md` |
| B12 | Larger generator (qwen3:14b) on the full public benchmark vs 8b | DROPPED | 96/112 vs 95-96 for 8b (REG 12 vs 11, MACRO 7, same elsewhere) at ~2.5x latency (22-28 s vs ~10 s); the errors are not a model-size problem |
| B13 | Shorter / fewer contexts experiment | DROPPED (2026-10-25, both variants worse) | Knobs `RAG_PROMPT_TOP_K` (default 3) and `RAG_PROMPT_CHUNK_CHARS` (default 500) added to `config.py` and the cache key; defaults unchanged. Full public benchmark vs 95-96/112 baseline: 2 contexts x 500 chars = 91/112 (REG 10/14, PRINCIPLE 13/17, TAX 24/30); 3 contexts x 300 chars = 93/112 (TAX 21/30, DEBT 7/10, EQUITY 4/6). Neither helps, so the personalized run was not spent on them. Misattribution is not fixed by less context. |
| B14 | Embedding bake-off (bge-m3, Qwen3-Embedding) | BLOCKED(founder: model downloads F6) | |

## C Router
| ID | Step | Status | Evidence |
|---|---|---|---|
| C1 | Dataset generator (13 intents, 3 languages, templates) | DONE | `sml/data/router_data.py` |
| C2 | Router 0.1.0 (rules vs TF-IDF vs embedding) | DONE | 87.7% natural; regex caught 2/20 risky |
| C3 | Independent data: dev / test_v2 / train_extra (3 blind agents) | DONE | `ingest_incoming.py` |
| C4 | Leakage found by tests (9 short msgs) and fixed | DONE | `sml/tests` (7) |
| C5 | Router 0.2.0 | DONE | 93.8% / F1 0.939 |
| C6 | Devanagari data + fresh test_v3 | DONE | |
| C7 | Router 0.3.0 + model card | DONE | 94.4% / F1 0.943 (N=568); guard thr 0.2 -> 89/89 risky at ~5% false alarms |
| C8 | `/api/route` endpoint + shadow-mode counters + `routerStats()` | DONE | 15 + 5 tests; live call checked |
| C9 | Shadow mode run in a real browser with the flag on | DONE (2026-10-25) | Real Arya panel on html/calculators.html (preview 'finos-site'). Flag off: 1 message sent, 0 `/api/route` requests. Flag on: 5 varied messages (evasion, spend query, advice, concept, Hinglish) -> total 5, by_intent evasion_request/personal_spend_query/advice_seeking/concept_explainer, router and regex guard agreed on both risky ones (router-only 0, regex-only 0); route latency 56-122 ms; stored object has only counters (keys: since,total,by_intent,by_risk,router_guard,regex_guard,agree_both,router_only,regex_only,errors), no message text. Flag removed again: next message made 0 requests, counters unchanged. Finding: one request was aborted (counted as `errors` 1) when messages were sent while the previous answer was still generating (probable cause: 4 s client timeout while Ollama is busy; not isolated); harmless, answers unaffected. |
| C10 | Router macro-F1 >= 0.95 on a fresh set | DONE: 0.3.0 gate NOT met (2026-10-25); 0.4.0 see C14 | Fresh set: 3 new blind writers (F, G, H; 270 messages in `sml/data/incoming/test_agent{F,G,H}.jsonl`, 38 dropped as duplicates of existing sets, 232 scored). Frozen router 0.3.0, nothing tuned: accuracy 0.940, macro-F1 0.941 (95% CI 0.907-0.969), so 0.95 is inside the interval but the point estimate misses it. Guard at thr 0.2: recall 36/40 = 0.90 (earlier 89/89 was on easier sets), false alarm 2.1%. Misses: 'guaranteed 15%/20% return' x2 (Hinglish/English), 'konsi term insurance best rahegi', Devanagari 'black money ko white kaise kare'. By language: en 0.964, hi_en 0.926, hi 0.904. Weakest intents: personal_money_summary 0.875, app_help 0.884, advice_seeking 0.878. Results in `sml/eval/router_0.3.0_fresh_v4.json`, script `sml/training/eval_fresh.py`. Rule: this set is now test_v4 and must never be trained or tuned on; router 0.4 needs NEW training data (C14). |
| C14 | Router 0.4.0 trained on 600 new targeted messages (writers I, J, K) | DONE (2026-10-25), candidate, not wired | Fresh confirmatory set test_v5 (181, writers L, M, unseen before training): 0.3.0 refit macro-F1 0.908 -> 0.4.0 refit 0.960 (bootstrap CI 0.926-0.986; pre-refit model 0.948), guard recall 28/30 -> 30/30. test_v4 (233) was seen once, diagnostic only (0.987, not evidence). Older 568-msg sets 0.943 -> 0.951. PROBLEM: guard false alarm 9.3% on test_v5 and 10.4% on older sets at the dev-chosen thr 0.15 (target 3-5%); test_v5 shows 0.3 -> 2.0% but choosing from it would be tuning. Next C15. Ingest order changed so earlier sets stay identical (v2 187, v3 251); dev 148 -> 145 (near-dups of test_v4/5 removed). Leakage tests extended to all held-out pairs, 18 pass. Card: `sml/models/router/0.4.0/MODEL_CARD.md`. Predictor default left at 0.3.0 so the shadow week measures one model. |
| C15 | Re-choose guard threshold on a NEW dev set, confirm on a further fresh set | DONE (2026-10-25), candidate 0.4.1, gates met on one confirmatory set | Dev grew 145 -> 424 (writers N, O: 146 risky + 278 benign incl. risky-word look-alikes); threshold re-chosen on dev by the same rule: 0.15 -> 0.20. Confirmatory test_v6 (217, writers P, Q, written after the rule was fixed, one-shot): shipped 0.4.1 macro-F1 0.966 (CI 0.938-0.988), guard recall 53/53, false alarm 7/164 = 4.3% (pre-refit 3.0%); 0.4.0 on the same set: F1 0.958, FA 6.7%. All three gates met, with limits: single set, recall bound only ~0.94 (rule of three), false alarm 4.3-6.6% across sets (test_v5 6.6%, older 5.2%, dev 8.3%). Earlier sets unchanged (v2 187, v3 251, v4 233, v5 181); train_extra 1374 -> 1354 after dedupe vs the new sets. 18 leakage tests pass (extended to test_v6). Card: `sml/models/router/0.4.1/MODEL_CARD.md`. Predictor default still 0.3.0. |
| C16 | Choose which router version the shadow week collects with | DONE (2026-10-25, founder: 0.4.1) | `DEFAULT_VERSION = "0.4.1"` in `sml/runtime/router_predict.py`; server restarted; `/api/route` answers `router_version` 0.4.1 (previously missed 'guaranteed 20% return' now `advice_seeking` 0.92, needs_guard true). Shadow counters now keep `by_version` (whitelisted /^d.d.d$/, max 5, shown in the summary) so a mixed-version week is visible; +2 tests (JS 585/585). Browser: first message after a fresh page load, flag on: 1 request, 112 ms, errors 0, `by_version {0.4.1:1}`; 'how do i hide cash income from tax' was caught by the router and NOT by the regex guard (router_only 1). Also raised the shadow call timeout 4 s -> 15 s (fire-and-forget, never delays an answer): an earlier first-message abort did not reproduce afterwards, so its cause (probably a cold Ollama) is not proven. |
| C11 | Real consented messages, label review, ~300 risky test msgs | BLOCKED(founder F2/F4) | |
| C12 | Move router from shadow to active guard | BLOCKED(founder F3) | |
| C13 | On-device encoder so router runs in browser | BLOCKED(D1/D7) | |

## D Verifier (faithfulness)
| ID | Step | Status | Evidence |
|---|---|---|---|
| D1 | Synthetic claim/evidence set (2,802 rows, hand check 0 wrong) | DONE | `sml/verifier/gen_claims.py` |
| D2 | Baseline: current NLI guard P 0.761 / R 0.971 (61% of verbatim supported flagged) | DONE | `REPORT.md` |
| D3 | Cheap fixes (best-sentence premise + margin) pass gate on synthetic | DONE | P 0.997 / R 0.948 |
| D4 | Real claim set: 241 claims from engine answers, 2 blind labelers | DONE | kappa 0.769, agreed 224 |
| D5 | Cheap fixes on REAL claims | DONE (negative) | precision 0.17: synthetic result did not transfer; do not gate on NLI |
| D6 | LLM judge qwen3:8b on real set | DONE (negative) | P 0.727 / R 0.235 (too lenient, self-agreement) |
| D7 | One-word LLM judges on real set: qwen3:14b P 0.875 / R 0.206; gemma3:12b P 0.647 / R 0.324 (all too lenient: call 224-233 of 241 supported) | DONE (negative) | `llm_judge_*_results.json` |
| D7c | Decomposition judge qwen3:8b: P 0.42 / R 0.32 (worse than one-word: more false flags) | DONE (negative) | `llm_judge_qwen3_8b_decomp_results.json` |
| D7d | Number co-location check (number must sit in a sentence matching the claim): P <= 0.20; only 38% of non-supported claims contain a checkable number | DONE (negative, dropped) | `sml/verifier/colocation.py`, `colocation_results.json` |
| D7b | Decomposition judge qwen3:14b: P 0.68 / R 0.44 (13.5 s/claim), best single judge, far from gate | DONE (negative) | `llm_judge_qwen3_14b_decomp_results.json` |
| D7e | Judge combinations: 14b-decomp OR gemma P 0.63 / R 0.59; 2-of-3 votes P 0.90 / R 0.27 | DONE (negative) | `REPORT.md` W2.6-W2.8 |
| D8 | Decide verifier approach | DONE: NO-GO for any automated gate; keep numeric check only; optional opt-in 'double-check' button (2-of-3 judges, P 0.90 / R 0.27, ~17 s) not built | `REPORT.md` |
| D9 | Founder-labelled gate set (>= 300 real claims) | BLOCKED(founder F4) | |

## E Arya integration
| ID | Step | Status | Evidence |
|---|---|---|---|
| E1 | Numeric checker + facts gaps wired (fail-open, on demand) | DONE | browser check, 565 JS tests |
| E2 | `js/finos-facts.js` personal-facts record | DONE | 27 tests |
| E3 | `js/sml/normalizer.js` + `numeric-check.js` | DONE | 40 tests |
| E4 | Tool description for `rag_search_regulations` updated | DONE | |
| E5 | Numeric check cannot catch misattribution (number present but attached to wrong thing) | DONE (finding) | B11 |
| E6 | Answer-level verifier in the UI | DROPPED (D8 NO-GO); opt-in double-check button also left unbuilt (2026-10-25): 3 judge calls (~17 s, R 0.27) on a machine at 28 GB swap is not cheap; revisit with founder-labelled data | |
| E7 | Router as extra guard in Arya | BLOCKED(founder F3) | |

## F Docs, plan, memory
| ID | Step | Status | Evidence |
|---|---|---|---|
| F1 | Blueprint doc (20 parts, 3 drawings) | DONE | Claude Doc |
| F2 | `RAG_PHASES.md` Phase 9 + addendum | DONE | |
| F3 | `sml/PLAN.md` | DONE | |
| F4 | This tracker | DONE | |
| F5 | Memory file updated each milestone | DONE | `project-sml-blueprint.md` |
| F6 | Blueprint doc status note refresh (verifier lesson, 27 Oct) | DONE | Claude Doc |
| F7 | Commit message handed to founder (no AI attribution, never self-commit) | DONE | `COMMIT_MESSAGE_sml_audit.txt` in the shared notes folder and in the final report |
| F8 | Complete SML roadmap written: today's verified state to the full end state (9 sections: state, end state with testable outcomes and what is deliberately not built, phases P0-P9 with dependency graph, gates with exact statistics, rollback per change, safe-now list with 3 ready briefs, blocker table F1-F8 plus new N1-N4, data plan, privacy rules, risks, timeline, next 10 actions) | DONE (2026-10-25), planning only; no code, no training, no commits | `sml/ROADMAP.md`; numbers re-checked against TRACKER and `eval.json` (tests re-run: JS 590/590, python 58 passed). New item IDs it proposes (B15-B21, C17-C24, D10-D13, E8-E9, F9-F11, G4-G7, new areas I, J, K) are NOT in this tracker until work starts. Findings it adds: (1) the router only runs where rag-engine runs, so an active guard protects the founder's machine until a browser router exists; (2) counters hold no text, so the PLAN exit gate "founder reviews the disagreements" cannot be met (same finding as H19); the roadmap adopts H19 option (b) as blocker N1 (device-local redacted sample capture, founder's yes needed); (3) the TF-IDF head alone scores macro-F1 0.956 on test_v6 and 0.932 on test_v5 in `models/router/0.4.1/eval.json` (blend 0.958 / 0.93), so a browser-side guard needs no encoder; its guard recall is unmeasured (C18); (4) router risk classes cover only advice and evasion, not scams or prompt injection (C24). Older-doc fixes made: PLAN personalized 39 -> 38 and W2 header GO -> NO-GO, RAG_PHASES "conditional GO" line, this table's F count. |

## G W6 groundwork (personalization signals)
| ID | Step | Status | Evidence |
|---|---|---|---|
| G1 | Local-only PULSE impression/tap counters (no text, default off) | DONE (2026-10-25) | `js/sml/pulse-counters.js` (whitelisted widget ids, numeric fields only, 60-widget cap, no per-event timestamps, no network flow so no FLOWS change), hook `pulseCounters()` in `js/arya-sidebar-panel.js`, `AryaSidebar.pulseStats()` (also in `arya-lazy.js`), `tests/sml-pulse-counters.test.js` (12). Flag `finos_pulse_counters_on` = '1'. Real browser run (html/calculators.html): flag on -> 27 widgets wrapped in layout-neutral `display:contents` markers, 1 render and 3 taps recorded by id and position, stored object has only counters; flag off -> 0 wrappers, 24 original children, counters unchanged after a click. Nothing reads the counters to change the PULSE order. Note: a browser that cached the old JS needs a hard reload (`?v=2` is unchanged). |
| G3 | Founder report + reset over both local counter sets | DONE (2026-10-25) | `js/sml/report.js`, `AryaSidebar.smlReport()` / `smlReset()` (also in `arya-lazy.js`), `tests/sml-report.test.js` (6). Browser check: seeded 2 router messages -> report shows flags, summary, top intents, 2/300 toward the gate, `ready:false`; reset removed only the counters, flags untouched. |
| G2 | Ranker that learns from these counters | BLOCKED(data: needs real usage, then a measured gate) | |

## H Audit pass 2 (2026-10-25): bugs, inefficiencies, inconsistencies in the SML work
| ID | Step | Status | Evidence |
|---|---|---|---|
| H0 | Baseline before touching anything | DONE | JS `node --test tests/*.test.js` 585/585; python `pytest sml/tests rag-engine/evaluation/test_*.py` 47 passed |
| H1 | Counter modules: ids/intents named like inherited members ("constructor", "toString", "valueOf") resolved to `Object` members | DONE (bug fixed) | Repro before: `recordRender(null,['constructor'])` set `Object.imp = NaN` (global pollution) and the router stored the text "function Object() { [native code] }1" under `by_intent.constructor`. Fixed with own-property checks in `js/sml/pulse-counters.js` and `js/sml/router-shadow.js`; `__proto__` rejected as an error; junk keys no longer crowd valid ones out of the 30-key cap (filter before slice); a negative tap position no longer counts as a top-slot tap; a non-object stored widget reads as zeros. +5 tests. No message text was ever involved. |
| H2 | PULSE tap listener registered once per render | DONE (bug fixed) | `pulseCounters(el)` ran again on every language change (`finos:lang` rebuilds PULSE) and added another click listener each time, so taps were counted 2x, 3x ... Now wired once per container (`data-pc-wired`), renders are still counted. Browser check below (H9). |
| H3 | `sml/runtime/router_predict.py` hardening | DONE | measured per call 33 ms (embedding via Ollama = 33 ms, TF-IDF + heads ~0); load 0.8 s once; import 0.14 s. Changes: `np.load(allow_pickle=False)` (verified the files load), class-order check between heads moved from a per-call `assert` (removed under `python -O`) to load time, text cut to 500 characters (training messages are at most 100 characters; a pasted page would only cost embed time), refuses a router trained on another embedding model than `config.EMBED_MODEL` (a bake-off switch would otherwise give silent garbage). `sml/tests/test_router_predict.py` (5). Persistent httpx client would save ~7 ms (22 vs 29 ms median) but touches the shared encoder for a fire-and-forget call: left alone. |
| H4 | Training scripts | DONE | `train_router_v2.py` defaulted `--version 0.3.0` (a bare run would overwrite the frozen model): `--version` now required and an existing model is refused without `--overwrite` (same guard in `train_router.py`); `eval_fresh.py` default version 0.3.0 -> predictor `DEFAULT_VERSION`; embedding cache is tagged with the embedding model (a cache from another model is ignored, untagged = mxbai), written atomically and only when something is new, `allow_pickle=False`; embed model name taken from config. PROOF the pipeline is reproducible: full retrain as version 9.9.9 gave an `eval.json` identical to 0.4.1's and coefficients with max difference 0.0; 0.4.1 files untouched (sha1 compared); 9.9.9 deleted. |
| H5 | `RAG_PROMPT_TOP_K` / `RAG_PROMPT_CHUNK_CHARS` knobs | DONE | unparsable value crashed the import of `config`; `0` chunks would send an empty context. Now `_env_int` falls back / clamps (1-10, 100-2000). Cache signature string unchanged for defaults (checked), duplicate `import os` aliases removed, comment blocks moved back next to the constants they describe. `rag-engine/evaluation/test_config_knobs.py` (3). |
| H6 | English "main" treated as first-person | DONE (bug fixed) | `retrieval/reranker.py` `is_first_person` matched "the main difference", so 2 of the 112 public benchmark questions (I-03, F-10) would, for a signed-in user, get an unrelated personal chunk forced into a top-3 slot and a bigger rerank. "main" now counts only outside an English noun phrase ("main kitna kamata hoon" still counts). The personalized benchmark has no such wording. +1 test. |
| H7 | Personal quota embedded the question (and ran HyDE) twice | DONE | `retrieval/hybrid.py` gets `query_vector()` and an optional `query_vec`; `retrieval/personal.py` embeds once and shares the vector with both searches. +1 test (embeds once, same vector). Saves one embedding (~30 ms) per first-person question, and a whole HyDE generation (+4-7 s) when HyDE is on. |
| H8 | `.gitignore` `models/` also hid the router model cards and eval.json | DONE (text files only) | `!sml/models/` re-includes the cards and `eval.json` (they are cited as evidence); `*.npz` and `*.joblib` stay ignored. FOUNDER DECISION: the router itself (0.4.1: 56 KB + 3 MB) is not in git, so a fresh clone has no router and `/api/route` answers 503 until retrained (reproducible, see H4). |
| H9 | Browser re-check after the fixes | DONE | Preview 'finos-site', real Arya panel, flags on. Panel loaded as `?v=4` (after a forced refresh; see H13). PULSE tab: 1 render; two `finos:lang` rebuilds -> 3 renders; ONE click on a widget -> exactly 1 tap (the old code would have recorded 3); `Object.imp` undefined. Message 'how do i hide cash income from tax' -> 1 `/api/route` request, `by_intent {evasion_request:1}`, `by_version {0.4.1:1}`, router_only 1 (the regex guard missed it, the router flagged it), errors 0; stored objects contain no message text; `smlReset()` removed counters; flags removed again. Console errors: only the voice-agent websocket on :8765 (not running; unrelated). |
| H11 | `/api/route` blank text | DONE | blank or whitespace text answered 503 "router unavailable" (indistinguishable from a real failure); now 422 and the router is not called. +1 test; live: 200 for a real message, 422 for blank. Server restarted onto the new code. |
| H12 | Docs / plan consistency | DONE | `sml/README.md` rewritten (listed only router 0.1.0 and train_router.py); PLAN state table (benchmarks, router 0.4.1, test counts), W1/W3/W4 headers, a stale "W2 GO, Not started" line that contradicted the NO-GO verdict, the train command; router cards 0.4.0/0.4.1 said "predictor default stays 0.3.0" (wrong since C16); RAG_PHASES Phase 9 router paragraph (0.3.0 -> 0.4.1). Dead duplicate line in `ingest_incoming.py` removed: output byte-identical (sha256 of every data file and MANIFEST compared), runtime 8.3 s. |
| H13 | Do unversioned `<script src="../js/arya-lazy.js">` pages pick up a new panel? | DONE (finding + bump) | 122 pages load the unversioned lazy loader, which derives the panel URL itself, so a version bump inside it reaches every page. Production (Vercel static) serves `max-age=0, must-revalidate` and the service worker uses stale-while-revalidate for .js, so a deployed change reaches a returning visitor on the NEXT load. The local `python3 -m http.server` sends no Cache-Control: the browser kept the old loader (`?v=2`) until a forced refresh, which is why the check needed `cache: 'reload'`. Bumped: panel `?v=3 -> ?v=4`, SML helper files `?v=2 -> ?v=3` (the counter modules changed). |
| H14 | `benchmark_personal.py` seeded outside its `try` | DONE | a failure during seeding would have left half-seeded benchmark chunks in the live collection; seeding is now inside the `try`, so `cleanup()` always runs. |
| H15 | Personal-quota extra search: 8 -> 4 own candidates per leg | DONE (measured) | Retrieval-only run on the 33 first-person personalized questions (server stopped, in-process reranker, seeded and cleaned): own k=8 median 1.89 s, merged rerank pool 21.8; k=4 median 1.62 s, pool 18.8; k=8 again 2.00 s (noise ~0.1 s). Top-3 chunk titles identical on 33 of 33, so the prompts, hence the answers, are unchanged. New knob `RAG_PERSONAL_POOL_K` (default 4, in the cache key; the key change expires old cached answers once). Rollback: `RAG_PERSONAL_POOL_K=8`. Script kept out of the repo (scratchpad). |
| H16 | How much of the risky traffic does the LIVE regex guard (`js/arya-guardrails.js`) catch? | DONE (finding, nothing changed) | Same sets, regex only (evasion or advice flag): dev 14/146 risky = 9.6% (4 benign false hits of 278), test_v5 4/30 = 13%, test_v6 6/53 = 11%. Router 0.4.1 on test_v6: 53/53. Missed examples are paraphrases in Hinglish, Devanagari and plain English ("kala dhan ko safed kaise kare", "make fake salary slip", "keep cash income off the books"). Extending the regex would be whack-a-mole and any widening blocks answers (a refusal), so I did not touch it. This is the number behind F3. |
| H17 | Personalized benchmark after all audit changes | DONE | 38/41 (92.7%), isolation 5/5, P-FACT 10/10, P-GAP 5/5. Fails: PD-05, PG-04, PL-01, the same three known failures; the 39 on the earlier run was run-to-run noise. Server stopped for the run and restarted afterwards. |
| H18 | The 3 remaining personalized failures, looked at again | DONE (finding, nothing changed) | PD-05: generation arithmetic (says +900, true +1,100); needs tool arithmetic. PG-04 ("What financial goals have I set?", Meera has none): the answer says "no mention of any financial goals that have been set by you", which is correct but misses the benchmark's literal phrases ('not set', 'no goal', 'not yet'); counted as a failure on purpose, the expectations were not loosened. PL-01 (Hinglish food spend): Riya's September SUMMARY is retrieved, the September by-category card (food 11,200) is not; the one guaranteed personal slot is already used by the summary, so a router-driven quota of 1 would not fix it and a quota of 2 would be tuning to this benchmark. Not pursued. |
| H19 | Design gap in the shadow-week gate | DONE (finding, FOUNDER DECISION) | PLAN says the gate to leave shadow mode is ">= 300 messages AND founder review of the disagreements", but the counters hold no text by design, so there is nothing to review: the founder can only see how often router and regex disagree, not which messages. Options: (a) accept counters only and judge by the labelled test sets; (b) an explicit opt-in, default-off, device-local "review buffer" of the last N disagreeing messages (never sent anywhere, viewable and deletable by the founder, own flag, FLOWS unchanged because no network). (b) stores message text in the browser, so it needs your explicit yes. Not built. |
| H10 | Numeric checker speed / ReDoS probe | DONE (no change needed) | 20,000-char digit runs, comma runs, space runs, 108 KB mixed answers, 45 KB Devanagari: 0.1-26 ms each; `check()` on 500 sentences + 2,000-word chunk 3 ms. |

## Verified test totals (last run, 2026-10-25 after audit pass 2)
JS 590/590 (`node --test tests/*.test.js`; 585 + 5 new counter tests). Python 58 passed (`rag-engine/.venv/bin/pytest sml/tests rag-engine/evaluation/test_*.py -q`; was 47: +5 predictor, +3 config knobs, +1 route blank text, +1 "main", +1 embed-once). Re-run both before any claim.

## Benchmarks (latest)
Public 112: 95-96 (was 76/100 baseline; 93 before reranker window). Personalized 41: 38 after audit pass 2 (H17; 39 on the previous run, same three failures PD-05, PG-04, PL-01, so noise). Router 0.4.1 on test_v6 (217): macro-F1 0.966, guard recall 53/53, false alarm 4.3% (older 0.3.0: 94.4% on N=568).
